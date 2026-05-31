import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock3,
  Cpu,
  Database,
  HardDrive,
  Loader2,
  MessageSquare,
  RefreshCw,
  Server,
  Users,
  Wifi,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import AdminIconButton from "@/components/admin/AdminIconButton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  adminService,
  type AdminObservabilityData,
  type AdminObservabilityRangeKey,
} from "@/services/adminService";
import { getApiErrorMessage } from "@/lib/apiMessage";

const rangeOptions: Array<{ key: AdminObservabilityRangeKey; label: string }> = [
  { key: "15m", label: "15 phút" },
  { key: "1h", label: "1 giờ" },
  { key: "6h", label: "6 giờ" },
  { key: "24h", label: "24 giờ" },
  { key: "7d", label: "7 ngày" },
];

const chartBlue = "rgb(37 99 235)";
const chartCyan = "rgb(8 145 178)";
const chartGreen = "rgb(22 163 74)";
const chartRed = "rgb(220 38 38)";
const chartAmber = "rgb(217 119 6)";

function formatNumber(value?: number | null, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits }).format(value || 0);
}

function formatBytes(value?: number | null) {
  const bytes = value || 0;
  if (bytes >= 1024 * 1024 * 1024) return `${formatNumber(bytes / 1024 / 1024 / 1024, 2)} GB`;
  if (bytes >= 1024 * 1024) return `${formatNumber(bytes / 1024 / 1024, 2)} MB`;
  if (bytes >= 1024) return `${formatNumber(bytes / 1024, 1)} KB`;
  return `${formatNumber(bytes)} B`;
}

function formatDuration(seconds?: number | null) {
  const value = Math.max(0, Math.floor(seconds || 0));
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);

  if (days > 0) return `${days} ngày ${hours} giờ`;
  if (hours > 0) return `${hours} giờ ${minutes} phút`;
  return `${minutes} phút`;
}

function formatTimeLabel(value: string, range: AdminObservabilityRangeKey) {
  const date = new Date(value);

  if (range === "7d") {
    return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
  }

  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

export default function AdminObservabilityPage() {
  const [range, setRange] = useState<AdminObservabilityRangeKey>("24h");
  const [data, setData] = useState<AdminObservabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadObservability = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      const result = await adminService.getObservability(range);
      setData(result);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, "Không thể tải dữ liệu giám sát"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range]);

  useEffect(() => {
    void loadObservability();

    const timer = window.setInterval(() => {
      void loadObservability(true);
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [loadObservability]);

  const runtime = data?.summary.runtime || null;
  const runtimeSamples = useMemo(
    () => data?.runtimeSamples || [],
    [data?.runtimeSamples]
  );
  const series = useMemo(
    () => data?.series || [],
    [data?.series]
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border/70 px-4 py-4 md:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Activity className="size-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-normal">Giám sát hệ thống</h1>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Biểu đồ runtime backend, request, lỗi, độ trễ và hoạt động dữ liệu của NexCon.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-2">
              {rangeOptions.map((item) => (
                <Button
                  key={item.key}
                  variant={range === item.key ? "default" : "outline"}
                  size="sm"
                  className="h-9 rounded-md"
                  onClick={() => setRange(item.key)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <AdminIconButton
              label="Làm mới"
              className="rounded-md"
              disabled={refreshing}
              onClick={() => void loadObservability(true)}
            >
              {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </AdminIconButton>
          </div>
        </div>
      </header>

      <div className="beautiful-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        {loading && !data ? (
          <div className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Đang tải dữ liệu giám sát
          </div>
        ) : (
          <div className="mx-auto grid w-full max-w-7xl gap-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={Cpu}
                label="CPU"
                value={`${formatNumber(runtime?.cpuVCpu, 3)} vCPU`}
                hint={`Uptime ${formatDuration(runtime?.uptimeSeconds)}`}
                iconClassName="text-blue-600"
              />
              <MetricCard
                icon={HardDrive}
                label="Bộ nhớ RSS"
                value={`${formatNumber(runtime?.memoryRssMb, 1)} MB`}
                hint={`Heap ${formatNumber(runtime?.heapUsedMb, 1)} / ${formatNumber(runtime?.heapTotalMb, 1)} MB`}
                iconClassName="text-cyan-600"
              />
              <MetricCard
                icon={BarChart3}
                label="Requests"
                value={formatNumber(data?.summary.requests)}
                hint={`${formatNumber(data?.summary.avgLatencyMs)} ms trung bình`}
                iconClassName="text-emerald-600"
              />
              <MetricCard
                icon={AlertTriangle}
                label="Server errors"
                value={formatNumber(data?.summary.errors)}
                hint={`${formatNumber(data?.summary.errorRate, 2)}% error rate`}
                iconClassName="text-red-600"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={MessageSquare}
                label="Tin nhắn mới"
                value={formatNumber(data?.summary.messages)}
                hint={`${formatNumber(data?.summary.totals.messages)} tổng tin nhắn`}
                iconClassName="text-violet-600"
              />
              <MetricCard
                icon={Users}
                label="Active users"
                value={formatNumber(data?.summary.activeUsers)}
                hint={`${formatNumber(data?.summary.newUsers)} user mới`}
                iconClassName="text-amber-600"
              />
              <MetricCard
                icon={Wifi}
                label="API egress"
                value={formatBytes(data?.summary.egressBytes)}
                hint="Ước tính từ response size"
                iconClassName="text-sky-600"
              />
              <MetricCard
                icon={Database}
                label="Tổng dữ liệu"
                value={`${formatNumber(data?.summary.totals.users)} users`}
                hint={`${formatNumber(data?.summary.totals.conversations)} conversations`}
                iconClassName="text-slate-600 dark:text-slate-300"
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <ChartPanel title="CPU usage" icon={Cpu} value={`${formatNumber(runtime?.cpuVCpu, 3)} vCPU`}>
                <LineChart
                  data={runtimeSamples}
                  range={range}
                  series={[{ key: "cpuVCpu", label: "CPU", color: chartBlue }]}
                  formatY={(value) => `${formatNumber(value, 2)} vCPU`}
                />
              </ChartPanel>

              <ChartPanel title="Memory usage" icon={HardDrive} value={`${formatNumber(runtime?.memoryRssMb, 1)} MB`}>
                <LineChart
                  data={runtimeSamples}
                  range={range}
                  series={[
                    { key: "memoryRssMb", label: "RSS", color: chartCyan },
                    { key: "heapUsedMb", label: "Heap used", color: chartGreen },
                  ]}
                  formatY={(value) => `${formatNumber(value, 0)} MB`}
                />
              </ChartPanel>

              <ChartPanel title="Request volume" icon={Activity} value={`${formatNumber(data?.summary.requests)} req`}>
                <BarChart
                  data={series}
                  range={range}
                  valueKey="requests"
                  secondaryKey="errors"
                  color={chartBlue}
                  secondaryColor={chartRed}
                  formatY={(value) => formatNumber(value)}
                  primaryLabel="Requests"
                  secondaryLabel="5xx"
                />
              </ChartPanel>

              <ChartPanel title="Latency" icon={Clock3} value={`${formatNumber(data?.summary.avgLatencyMs)} ms`}>
                <LineChart
                  data={series}
                  range={range}
                  series={[
                    { key: "avgDurationMs", label: "Average", color: chartAmber },
                    { key: "maxDurationMs", label: "Max", color: chartRed },
                  ]}
                  formatY={(value) => `${formatNumber(value)} ms`}
                />
              </ChartPanel>

              <ChartPanel title="App activity" icon={MessageSquare} value={`${formatNumber(data?.summary.messages)} messages`}>
                <LineChart
                  data={series}
                  range={range}
                  series={[
                    { key: "messages", label: "Messages", color: chartGreen },
                    { key: "reports", label: "Reports", color: chartRed },
                    { key: "newUsers", label: "New users", color: chartBlue },
                  ]}
                  formatY={(value) => formatNumber(value)}
                />
              </ChartPanel>

              <ChartPanel title="Network egress" icon={Wifi} value={formatBytes(data?.summary.egressBytes)}>
                <BarChart
                  data={series}
                  range={range}
                  valueKey="egressBytes"
                  color={chartCyan}
                  formatY={formatBytes}
                  primaryLabel="Response bytes"
                />
              </ChartPanel>
            </div>

            <section className="overflow-hidden rounded-md border border-border/70 bg-card">
              <div className="flex flex-col gap-1 border-b border-border/70 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2 font-medium">
                  <Server className="size-4 text-primary" />
                  Error logs gần đây
                </div>
                <span className="text-xs text-muted-foreground">
                  {data?.summary.totals.openReports ? `${formatNumber(data.summary.totals.openReports)} report đang mở` : "Không có report đang mở"}
                </span>
              </div>

              {!data?.recentErrors.length ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Chưa có lỗi HTTP trong khoảng thời gian này.
                </div>
              ) : (
                <div className="overflow-x-auto beautiful-scrollbar">
                  <div className="min-w-[720px]">
                    <div className="grid grid-cols-[130px_90px_minmax(260px,1fr)_100px_110px] gap-3 border-b border-border/70 bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
                      <span>Thời gian</span>
                      <span>Method</span>
                      <span>Path</span>
                      <span>Status</span>
                      <span>Latency</span>
                    </div>
                    {data.recentErrors.map((log) => (
                      <div
                        key={log._id}
                        className="grid grid-cols-[130px_90px_minmax(260px,1fr)_100px_110px] gap-3 border-b border-border/50 px-4 py-3 text-sm last:border-b-0"
                      >
                        <span className="text-muted-foreground">{formatDateTime(log.createdAt)}</span>
                        <span className="font-medium">{log.method}</span>
                        <span className="truncate font-mono text-xs">{log.path}</span>
                        <span className={cn("font-semibold", log.statusCode >= 500 ? "text-destructive" : "text-amber-600")}>
                          {log.statusCode}
                        </span>
                        <span>{formatNumber(log.durationMs)} ms</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  iconClassName,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  iconClassName?: string;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</div>
          <div className="mt-2 truncate text-2xl font-semibold">{value}</div>
        </div>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon className={cn("size-5", iconClassName)} />
        </div>
      </div>
      <div className="mt-3 truncate text-sm text-muted-foreground">{hint}</div>
    </div>
  );
}

function ChartPanel({
  title,
  icon: Icon,
  value,
  children,
}: {
  title: string;
  icon: LucideIcon;
  value: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-border/70 bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-primary" />
          <h2 className="truncate text-sm font-semibold">{title}</h2>
        </div>
        <span className="shrink-0 text-sm font-medium text-muted-foreground">{value}</span>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function LineChart<T extends { timestamp: string }>({
  data,
  range,
  series,
  formatY,
}: {
  data: T[];
  range: AdminObservabilityRangeKey;
  series: Array<{ key: keyof T & string; label: string; color: string }>;
  formatY: (value: number) => string;
}) {
  const width = 640;
  const height = 240;
  const padding = { top: 16, right: 48, bottom: 34, left: 52 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const values = data.flatMap((item) => series.map((line) => Number(item[line.key] || 0)));
  const maxValue = Math.max(1, ...values);
  const labels = data.length > 0 ? [0, Math.floor((data.length - 1) / 2), data.length - 1] : [];

  const xFor = (index: number) => (
    data.length <= 1
      ? padding.left + innerWidth / 2
      : padding.left + (index / (data.length - 1)) * innerWidth
  );
  const yFor = (value: number) => padding.top + innerHeight - (value / maxValue) * innerHeight;

  return (
    <div className="grid gap-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full" role="img">
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + innerHeight} stroke="currentColor" className="text-border" />
        <line x1={padding.left} y1={padding.top + innerHeight} x2={padding.left + innerWidth} y2={padding.top + innerHeight} stroke="currentColor" className="text-border" />
        {[maxValue, maxValue / 2, 0].map((value) => {
          const y = yFor(value);
          return (
            <g key={value}>
              <line x1={padding.left} y1={y} x2={padding.left + innerWidth} y2={y} stroke="currentColor" className="text-border/60" strokeDasharray="4 6" />
              <text x={width - 4} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
                {formatY(value)}
              </text>
            </g>
          );
        })}

        {data.length === 0 ? (
          <text x={width / 2} y={height / 2} textAnchor="middle" className="fill-muted-foreground text-xs">
            Chưa có dữ liệu
          </text>
        ) : (
          series.map((line, lineIndex) => {
            const points = data.map((item, index) => ({
              x: xFor(index),
              y: yFor(Number(item[line.key] || 0)),
            }));
            const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
            const areaPath = lineIndex === 0 && points.length > 1
              ? `M ${points[0].x} ${padding.top + innerHeight} L ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${points[points.length - 1].x} ${padding.top + innerHeight} Z`
              : "";

            return (
              <g key={line.key}>
                {areaPath && <path d={areaPath} fill={line.color} opacity="0.08" />}
                <path d={path} fill="none" stroke={line.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                {points.length === 1 && <circle cx={points[0].x} cy={points[0].y} r="3.5" fill={line.color} />}
              </g>
            );
          })
        )}

        {labels.map((index) => (
          <text
            key={index}
            x={xFor(index)}
            y={height - 8}
            textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}
            className="fill-muted-foreground text-[11px]"
          >
            {data[index] ? formatTimeLabel(data[index].timestamp, range) : ""}
          </text>
        ))}
      </svg>
      <ChartLegend items={series.map((line) => ({ label: line.label, color: line.color }))} />
    </div>
  );
}

function BarChart<T extends { timestamp: string }>({
  data,
  range,
  valueKey,
  secondaryKey,
  color,
  secondaryColor,
  formatY,
  primaryLabel,
  secondaryLabel,
}: {
  data: T[];
  range: AdminObservabilityRangeKey;
  valueKey: keyof T & string;
  secondaryKey?: keyof T & string;
  color: string;
  secondaryColor?: string;
  formatY: (value: number) => string;
  primaryLabel: string;
  secondaryLabel?: string;
}) {
  const width = 640;
  const height = 240;
  const padding = { top: 16, right: 48, bottom: 34, left: 52 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const values = data.flatMap((item) => [
    Number(item[valueKey] || 0),
    secondaryKey ? Number(item[secondaryKey] || 0) : 0,
  ]);
  const maxValue = Math.max(1, ...values);
  const labels = data.length > 0 ? [0, Math.floor((data.length - 1) / 2), data.length - 1] : [];
  const barGap = 3;
  const barWidth = data.length > 0 ? Math.max(3, innerWidth / data.length - barGap) : 0;
  const xFor = (index: number) => padding.left + index * (innerWidth / Math.max(1, data.length));
  const yFor = (value: number) => padding.top + innerHeight - (value / maxValue) * innerHeight;

  return (
    <div className="grid gap-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full" role="img">
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + innerHeight} stroke="currentColor" className="text-border" />
        <line x1={padding.left} y1={padding.top + innerHeight} x2={padding.left + innerWidth} y2={padding.top + innerHeight} stroke="currentColor" className="text-border" />
        {[maxValue, maxValue / 2, 0].map((value) => {
          const y = yFor(value);
          return (
            <g key={value}>
              <line x1={padding.left} y1={y} x2={padding.left + innerWidth} y2={y} stroke="currentColor" className="text-border/60" strokeDasharray="4 6" />
              <text x={width - 4} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
                {formatY(value)}
              </text>
            </g>
          );
        })}

        {data.length === 0 ? (
          <text x={width / 2} y={height / 2} textAnchor="middle" className="fill-muted-foreground text-xs">
            Chưa có dữ liệu
          </text>
        ) : (
          data.map((item, index) => {
            const value = Number(item[valueKey] || 0);
            const secondaryValue = secondaryKey ? Number(item[secondaryKey] || 0) : 0;
            const x = xFor(index);
            const y = yFor(value);
            const secondaryY = yFor(secondaryValue);

            return (
              <g key={item.timestamp}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={padding.top + innerHeight - y}
                  rx="2"
                  fill={color}
                  opacity="0.72"
                />
                {secondaryKey && secondaryValue > 0 && (
                  <rect
                    x={x}
                    y={secondaryY}
                    width={barWidth}
                    height={padding.top + innerHeight - secondaryY}
                    rx="2"
                    fill={secondaryColor || chartRed}
                    opacity="0.9"
                  />
                )}
              </g>
            );
          })
        )}

        {labels.map((index) => (
          <text
            key={index}
            x={xFor(index)}
            y={height - 8}
            textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}
            className="fill-muted-foreground text-[11px]"
          >
            {data[index] ? formatTimeLabel(data[index].timestamp, range) : ""}
          </text>
        ))}
      </svg>
      <ChartLegend
        items={[
          { label: primaryLabel, color },
          ...(secondaryKey && secondaryLabel ? [{ label: secondaryLabel, color: secondaryColor || chartRed }] : []),
        ]}
      />
    </div>
  );
}

function ChartLegend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="flex flex-wrap gap-3 px-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
