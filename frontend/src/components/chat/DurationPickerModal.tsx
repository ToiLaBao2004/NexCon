import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const customUnitLabels: Record<CustomUnit, string> = {
  minutes: "phút",
  hours: "giờ",
  days: "ngày",
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[440px] gap-0 overflow-hidden rounded-2xl border-border/70 bg-background p-0 shadow-2xl">
        <DialogHeader className="gap-1 border-b border-border/60 px-6 py-4 pr-12 text-left">
          <DialogTitle className="text-xl font-semibold leading-7 tracking-tight">Tin nhắn tự xóa</DialogTitle>
          <DialogDescription className="mt-1.5 text-sm font-normal leading-6 text-foreground">
            Chế độ tự xóa sẽ tự tắt sau thời gian đã chọn. Mỗi tin nhắn tự xóa sẽ biến mất sau 24 giờ.
          </DialogDescription>
        </DialogHeader>

        <div className="beautiful-scrollbar grid max-h-[min(56vh,420px)] grid-cols-2 gap-2 overflow-y-auto px-4 py-3">
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
                "flex min-h-10 w-full items-center justify-between rounded-lg border border-transparent px-3 py-2 text-left text-base transition-colors",
                !customOpen && selected === option.value
                  ? "border-primary/20 bg-primary/10 font-medium text-primary"
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
              "col-span-2 flex min-h-10 w-full items-center justify-between rounded-lg border border-transparent px-3 py-2 text-left text-base transition-colors",
              customOpen ? "border-primary/20 bg-primary/10 font-medium text-primary" : "hover:bg-muted/60",
              readOnly && "cursor-default",
            )}
          >
            Tùy chỉnh...
            {customOpen && <Check className="h-4 w-4" />}
          </button>

          {customOpen && (
            <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2 px-1">
              <Input
                type="number"
                min={MIN_DISAPPEARING_DURATION_SECONDS / unitMultiplier[customUnit]}
                max={MAX_DISAPPEARING_DURATION_SECONDS / unitMultiplier[customUnit]}
                step="any"
                value={customValue}
                disabled={readOnly}
                onChange={(event) => setCustomValue(event.target.value)}
                aria-label="Thời lượng tùy chỉnh"
                className="hide-number-spin-button h-10 rounded-lg bg-background text-base md:text-base"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={readOnly}
                    className="h-10 min-w-[104px] justify-between rounded-lg px-3 text-base font-normal shadow-xs"
                  >
                    {customUnitLabels[customUnit]}
                    <ChevronDown className="h-4 w-4 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[104px] rounded-lg">
                  <DropdownMenuRadioGroup
                    value={customUnit}
                    onValueChange={(value) => setCustomUnit(value as CustomUnit)}
                  >
                    {(Object.keys(customUnitLabels) as CustomUnit[]).map((unit) => (
                      <DropdownMenuRadioItem key={unit} value={unit} className="text-sm">
                        {customUnitLabels[unit]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              {!customIsValid && (
                <p className="col-span-2 text-sm text-destructive">
                  Thời lượng phải từ 1 phút đến 30 ngày.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-end gap-2 border-t border-border/60 bg-card px-5 py-3.5">
          {readOnly && (
            <p className="mr-auto text-[13px] leading-5 text-muted-foreground">
              Chỉ quản trị viên nhóm có thể thay đổi cài đặt này.
            </p>
          )}
          <Button
            type="button"
            disabled={saving || (!readOnly && customOpen && !customIsValid)}
            onClick={() => void confirm()}
            className="h-10 rounded-xl px-6 font-medium"
          >
            {readOnly ? "Lưu" : saving ? "Đang lưu..." : "Lưu thời lượng"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
