import { useEffect, useMemo, useState } from "react";
import { Check, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  DEFAULT_DISAPPEARING_AUTO_DISABLE_SECONDS,
  DISAPPEARING_DURATION_OPTIONS,
  MAX_DISAPPEARING_DURATION_SECONDS,
  MIN_DISAPPEARING_DURATION_SECONDS,
} from "@/utils/disappearingMessages";

type CustomUnit = "minutes" | "hours" | "days";

const unitMultiplier: Record<CustomUnit, number> = {
  minutes: 60,
  hours: 3600,
  days: 86400,
};

const getCustomDurationParts = (durationSeconds: number) => {
  if (durationSeconds % unitMultiplier.days === 0) {
    return { value: String(durationSeconds / unitMultiplier.days), unit: "days" as const };
  }
  if (durationSeconds % unitMultiplier.hours === 0) {
    return { value: String(durationSeconds / unitMultiplier.hours), unit: "hours" as const };
  }
  return { value: String(durationSeconds / unitMultiplier.minutes), unit: "minutes" as const };
};

interface DurationPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDurationSeconds?: number | null;
  onConfirm: (durationSeconds: number) => Promise<void> | void;
  readOnly?: boolean;
}

export function DurationPickerModal({
  open,
  onOpenChange,
  selectedDurationSeconds,
  onConfirm,
  readOnly = false,
}: DurationPickerModalProps) {
  const initialDuration = selectedDurationSeconds || DEFAULT_DISAPPEARING_AUTO_DISABLE_SECONDS;
  const [selected, setSelected] = useState(initialDuration);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("1");
  const [customUnit, setCustomUnit] = useState<CustomUnit>("hours");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(initialDuration);
    const isCustom = !DISAPPEARING_DURATION_OPTIONS.some((option) => option.value === initialDuration);
    setCustomOpen(isCustom);
    if (isCustom) {
      const custom = getCustomDurationParts(initialDuration);
      setCustomValue(custom.value);
      setCustomUnit(custom.unit);
    }
  }, [initialDuration, open]);

  const customDuration = useMemo(
    () => Math.round(Number(customValue) * unitMultiplier[customUnit]),
    [customUnit, customValue],
  );
  const customIsValid = Number.isFinite(customDuration)
    && customDuration >= MIN_DISAPPEARING_DURATION_SECONDS
    && customDuration <= MAX_DISAPPEARING_DURATION_SECONDS;

  const confirm = async () => {
    if (readOnly) {
      onOpenChange(false);
      return;
    }
    const duration = customOpen ? customDuration : selected;
    if (!customIsValid && customOpen) return;
    try {
      setSaving(true);
      await onConfirm(duration);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[88vh] max-w-xl rounded-t-3xl">
        <SheetHeader className="border-b border-border/60 px-5 pb-4 pt-5">
          <SheetTitle className="flex items-center gap-2">
            <Clock3 className="h-5 w-5 text-primary" />
            Tin nhắn tự xóa
          </SheetTitle>
          <SheetDescription>
            Chế độ tự xóa sẽ tự tắt sau thời gian đã chọn. Mỗi tin nhắn tự xóa sẽ biến mất sau 24 giờ.
          </SheetDescription>
        </SheetHeader>

        <div className="beautiful-scrollbar overflow-y-auto px-4 py-2">
          {DISAPPEARING_DURATION_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={readOnly}
              onClick={() => {
                setCustomOpen(false);
                setSelected(option.value);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm transition-colors",
                !customOpen && selected === option.value
                  ? "bg-primary/10 font-semibold text-primary"
                  : "hover:bg-muted/60",
                readOnly && "cursor-default",
              )}
            >
              {option.label}
              {!customOpen && selected === option.value && <Check className="h-4 w-4" />}
            </button>
          ))}

          <button
            type="button"
            disabled={readOnly}
            onClick={() => setCustomOpen(true)}
            className={cn(
              "flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm transition-colors",
              customOpen ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted/60",
              readOnly && "cursor-default",
            )}
          >
            Tùy chỉnh...
            {customOpen && <Check className="h-4 w-4" />}
          </button>

          {customOpen && (
            <div className="mx-3 mb-2 mt-1 grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-border/70 bg-muted/20 p-3">
              <Input
                type="number"
                min={MIN_DISAPPEARING_DURATION_SECONDS / unitMultiplier[customUnit]}
                max={MAX_DISAPPEARING_DURATION_SECONDS / unitMultiplier[customUnit]}
                step="any"
                value={customValue}
                disabled={readOnly}
                onChange={(event) => setCustomValue(event.target.value)}
                aria-label="Thời lượng tùy chỉnh"
                className="hide-number-spin-button"
              />
              <select
                value={customUnit}
                disabled={readOnly}
                onChange={(event) => setCustomUnit(event.target.value as CustomUnit)}
                className="rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="minutes">phút</option>
                <option value="hours">giờ</option>
                <option value="days">ngày</option>
              </select>
              {!customIsValid && (
                <p className="col-span-2 text-xs text-destructive">
                  Thời lượng phải từ 1 phút đến 30 ngày.
                </p>
              )}
            </div>
          )}
        </div>

        <SheetFooter className="border-t border-border/60 px-5 py-4">
          {readOnly && (
            <p className="text-xs text-muted-foreground">
              Chỉ quản trị viên nhóm có thể thay đổi cài đặt này.
            </p>
          )}
          <Button
            type="button"
            disabled={saving || (!readOnly && customOpen && !customIsValid)}
            onClick={() => void confirm()}
          >
            {readOnly ? "Đóng" : saving ? "Đang lưu..." : "Lưu thời lượng"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
