import { useState, useRef, useEffect, useCallback } from "react";
import { Square, Trash2, Send, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VoiceRecorderProps {
	onSend: (file: File) => void;
	onCancel: () => void;
}

const formatDuration = (seconds: number): string => {
	// Guard against NaN / Infinity coming from audio.duration on WebM blobs in Chrome
	if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) seconds = 0;
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${s < 10 ? "0" : ""}${s}`;
};

const BAR_COUNT = 28;

const VoiceRecorder = ({ onSend, onCancel }: VoiceRecorderProps) => {
	const [phase, setPhase] = useState<"recording" | "preview">("recording");
	const [duration, setDuration] = useState(0);
	const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
	const [audioFile, setAudioFile] = useState<File | null>(null);

	// Playback state
	const [isPlaying, setIsPlaying] = useState(false);
	const [playProgress, setPlayProgress] = useState(0); // 0–1
	// We use `duration` from the recording timer as the display total duration
	// (avoids the Infinity bug where Chrome returns Infinity for webm blob duration)

	// Waveform bars
	const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(0.15));
	const recordedBarsRef = useRef<number[][]>([]);

	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<BlobPart[]>([]);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const animFrameRef = useRef<number | null>(null);
	const audioContextRef = useRef<AudioContext | null>(null);
	const previewAudioRef = useRef<HTMLAudioElement | null>(null);
	const playRafRef = useRef<number | null>(null);
	// FIX: guard against React StrictMode double-mount
	const isStartedRef = useRef(false);
	// Keep recording duration stable even after timer clears
	const finalDurationRef = useRef(0);

	// Start recording
	const startRecording = useCallback(async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

			// Web Audio visualiser
			const audioContext = new AudioContext();
			audioContextRef.current = audioContext;
			const source = audioContext.createMediaStreamSource(stream);
			const analyser = audioContext.createAnalyser();
			analyser.fftSize = 64;
			// IMPORTANT: do NOT connect analyser to audioContext.destination
			// or the mic will play back through speakers causing echo
			source.connect(analyser);

			const dataArray = new Uint8Array(analyser.frequencyBinCount);
			recordedBarsRef.current = [];

			const drawBars = () => {
				animFrameRef.current = requestAnimationFrame(drawBars);
				analyser.getByteFrequencyData(dataArray);
				const sliceLen = Math.max(1, Math.floor(dataArray.length / BAR_COUNT));
				const newBars = Array.from({ length: BAR_COUNT }, (_, i) => {
					let sum = 0;
					for (let j = 0; j < sliceLen; j++) {
						sum += dataArray[i * sliceLen + j] ?? 0;
					}
					return Math.max(0.08, sum / sliceLen / 255);
				});
				setBars(newBars);
				recordedBarsRef.current.push(newBars);
			};
			drawBars();

			// MediaRecorder
			const mediaRecorder = new MediaRecorder(stream);
			mediaRecorderRef.current = mediaRecorder;
			chunksRef.current = [];

			mediaRecorder.ondataavailable = (e) => {
				if (e.data.size > 0) chunksRef.current.push(e.data);
			};

			mediaRecorder.onstop = () => {
				const blob = new Blob(chunksRef.current, { type: "audio/webm" });
				const url = URL.createObjectURL(blob);
				const file = new File([blob], `Voice_Message_${Date.now()}.webm`, {
					type: "audio/webm",
				});
				setAudioBlobUrl(url);
				setAudioFile(file);
				stream.getTracks().forEach((t) => t.stop());
			};

			mediaRecorder.start(200);
			setPhase("recording");
			setDuration(0);
			finalDurationRef.current = 0;

			timerRef.current = setInterval(() => {
				setDuration((prev) => {
					const next = prev + 1;
					finalDurationRef.current = next;
					return next;
				});
			}, 1000);
		} catch {
			onCancel();
		}
	}, [onCancel]);

	// Cleanup helper
	const cleanup = useCallback(() => {
		if (mediaRecorderRef.current?.state === "recording") {
			mediaRecorderRef.current.stop();
		}
		if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
		if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
		if (playRafRef.current) { cancelAnimationFrame(playRafRef.current); playRafRef.current = null; }
		if (audioContextRef.current) {
			audioContextRef.current.close();
			audioContextRef.current = null;
		}
	}, []);

	// Lifecycle: start once on mount (StrictMode-safe)
	useEffect(() => {
		// Prevent the second mount caused by React 18 StrictMode in dev
		if (isStartedRef.current) return;
		isStartedRef.current = true;

		startRecording();

		return () => {
			cleanup();
		};
	}, [startRecording, cleanup]);

	// Stop recording to switch to preview
	const stopRecording = useCallback(() => {
		if (mediaRecorderRef.current?.state === "recording") {
			mediaRecorderRef.current.stop();
		}
		if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
		if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
		if (audioContextRef.current) {
			audioContextRef.current.close();
			audioContextRef.current = null;
		}

		// Freeze bars: take the average of all recorded snapshots
		if (recordedBarsRef.current.length > 0) {
			const avg: number[] = Array(BAR_COUNT).fill(0);
			for (const snapshot of recordedBarsRef.current) {
				for (let i = 0; i < BAR_COUNT; i++) avg[i] += snapshot[i] ?? 0;
			}
			setBars(avg.map((v) => v / recordedBarsRef.current.length));
		}

		setPhase("preview");
	}, []);

	// Set up preview audio when blob URL is ready
	useEffect(() => {
		if (phase !== "preview" || !audioBlobUrl) return;

		const audio = new Audio(audioBlobUrl);
		previewAudioRef.current = audio;

		audio.onended = () => {
			setIsPlaying(false);
			setPlayProgress(0);
			if (playRafRef.current) cancelAnimationFrame(playRafRef.current);
		};

		return () => {
			audio.pause();
			audio.src = "";
		};
	}, [phase, audioBlobUrl]);

	// Playback using rAF instead of setInterval for smooth progress
	const togglePlay = useCallback(() => {
		const audio = previewAudioRef.current;
		if (!audio) return;

		if (isPlaying) {
			audio.pause();
			setIsPlaying(false);
			if (playRafRef.current) cancelAnimationFrame(playRafRef.current);
		} else {
			audio.play();
			setIsPlaying(true);

			const tick = () => {
				const dur = finalDurationRef.current || 1;
				setPlayProgress(Math.min(audio.currentTime / dur, 1));
				if (!audio.paused && !audio.ended) {
					playRafRef.current = requestAnimationFrame(tick);
				}
			};
			playRafRef.current = requestAnimationFrame(tick);
		}
	}, [isPlaying]);

	// Seek
	const handleSeek = useCallback((ratio: number) => {
		const audio = previewAudioRef.current;
		if (!audio) return;
		const dur = finalDurationRef.current || 0;
		audio.currentTime = ratio * dur;
		setPlayProgress(ratio);
	}, []);

	// Send or Cancel
	const handleSend = useCallback(() => {
		if (audioFile) onSend(audioFile);
	}, [audioFile, onSend]);

	const handleCancel = useCallback(() => {
		cleanup();
		if (previewAudioRef.current) previewAudioRef.current.pause();
		if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
		onCancel();
	}, [audioBlobUrl, cleanup, onCancel]);

	// Derived display
	const totalDur = finalDurationRef.current || duration;
	const activeBarsCount = Math.round(playProgress * BAR_COUNT);
	// Current playback seconds = ratio * total recording seconds
	const currentSec = Math.round(playProgress * totalDur);

	// Recording phase UI
	if (phase === "recording") {
		return (
			<div className="flex-1 flex items-center gap-2 px-3 h-9 bg-red-50 dark:bg-red-500/10 rounded-lg border border-red-200 dark:border-red-500/20 animate-in slide-in-from-right-2 duration-200 overflow-hidden">
				{/* Pulse dot + timer */}
				<div className="flex items-center gap-1.5 shrink-0">
					<div className="size-2 rounded-full bg-red-500 animate-pulse" />
					<span className="text-xs font-mono font-medium text-red-600 dark:text-red-400 tabular-nums w-8">
						{formatDuration(duration)}
					</span>
				</div>

				{/* Live waveform bars */}
				<div className="flex items-center gap-[2px] flex-1 h-6 overflow-hidden">
					{bars.map((h, i) => (
						<div
							key={i}
							className="rounded-full bg-red-400 dark:bg-red-500 transition-[height] duration-75 shrink-0"
							style={{
								width: "2px",
								height: `${Math.max(3, h * 22)}px`,
								opacity: 0.6 + h * 0.4,
							}}
						/>
					))}
				</div>

				{/* Buttons */}
				<div className="flex items-center gap-0.5 shrink-0">
					<Button type="button" variant="ghost" size="icon"
						className="size-7 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-500 dark:text-red-400"
						onClick={handleCancel} title="Hủy">
						<Trash2 className="size-3.5" />
					</Button>
					<Button type="button" variant="ghost" size="icon"
						className="size-7 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400"
						onClick={stopRecording} title="Dừng ghi âm">
						<Square className="size-3.5" fill="currentColor" />
					</Button>
				</div>
			</div>
		);
	}

	// Preview phase UI
	return (
		<div className="flex-1 flex items-center gap-2 px-3 h-9 bg-blue-50 dark:bg-blue-500/10 rounded-lg border border-blue-200 dark:border-blue-500/20 animate-in slide-in-from-right-2 duration-200 overflow-hidden">
			{/* Play / Pause */}
			<Button type="button" variant="ghost" size="icon"
				className="size-7 shrink-0 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20"
				onClick={togglePlay} title={isPlaying ? "Tạm dừng" : "Phát"}>
				{isPlaying
					? <Pause className="size-3.5" fill="currentColor" />
					: <Play className="size-3.5" fill="currentColor" />}
			</Button>

			{/* Seekable waveform */}
			<div
				className="flex items-center gap-[2px] flex-1 h-6 cursor-pointer overflow-hidden"
				onClick={(e) => {
					const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
					handleSeek((e.clientX - rect.left) / rect.width);
				}}
				title="Nhấn để tua"
			>
				{bars.map((h, i) => (
					<div
						key={i}
						className="rounded-full shrink-0 transition-colors duration-75"
						style={{
							width: "2px",
							height: `${Math.max(3, h * 22)}px`,
							backgroundColor: i < activeBarsCount
								? "rgb(59 130 246)"
								: "rgb(147 197 253 / 0.7)",
						}}
					/>
				))}
			</div>

			{/* Time display — always safe, no NaN/Infinity */}
			<span className="text-xs font-mono text-blue-600 dark:text-blue-400 tabular-nums shrink-0 w-10 text-right">
				{isPlaying || playProgress > 0
					? `${formatDuration(currentSec)} / ${formatDuration(totalDur)}`
					: formatDuration(totalDur)}
			</span>

			{/* Delete */}
			<Button type="button" variant="ghost" size="icon"
				className="size-7 shrink-0 hover:bg-red-100 dark:hover:bg-red-500/20 text-muted-foreground hover:text-red-500"
				onClick={handleCancel} title="Xóa">
				<Trash2 className="size-3.5" />
			</Button>

			{/* Send */}
			<Button type="button" size="icon"
				className="size-7 shrink-0 rounded-full bg-blue-500 hover:bg-blue-600 text-white transition-transform hover:scale-105"
				onClick={handleSend} title="Gửi tin nhắn thoại">
				<Send className="size-3" />
			</Button>
		</div>
	);
};

export default VoiceRecorder;
