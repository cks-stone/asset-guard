"use client";

import { useMemo, type CSSProperties } from "react";
import {
  ReactFlow,
  Handle,
  Position,
  MarkerType,
  Background,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { isSolanaMainnet } from "@/lib/config/env";

export interface TransferEdge {
  from: string | null;
  to: string;
  tx: string | null;
  at: string;
}

export interface LineageAssetInfo {
  management_no: string;
  model_name: string;
  serial_no: string | null;
  status: string;
  managed_by: string | null;
}

interface LineageGraphProps {
  asset: LineageAssetInfo;
  labels: Record<string, string | null>;
  transfers: TransferEdge[];
  currentManagedBy: string | null;
  viewer: string | null;
}

const shortAddr = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

function hueFor(wallet: string): number {
  let h = 0;
  for (let i = 0; i < wallet.length; i++) {
    h = (h * 31 + wallet.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

interface WalletNodeData {
  wallet: string;
  label: string | null;
  current: boolean;
  mine: boolean;
}

const handleStyle: CSSProperties = {
  width: 10,
  height: 10,
  background: "transparent",
  border: "none",
};

function WalletFlowNode({ data }: NodeProps) {
  const { wallet, label, current, mine } = data as unknown as WalletNodeData;
  const hue = hueFor(wallet);
  return (
    <div
      className="relative flex h-[84px] w-52 flex-col justify-center gap-0.5 overflow-visible rounded-lg border px-3 py-2"
      style={{
        borderColor: `hsl(${hue} 60% 45%)`,
        background: `hsl(${hue} 60% 18% / 0.55)`,
      }}
      title={wallet}
    >
      <Handle type="target" id="left" position={Position.Left} style={handleStyle} />
      <Handle type="target" id="top" position={Position.Top} style={handleStyle} />
      <Handle type="target" id="right" position={Position.Right} style={handleStyle} />
      <Handle type="target" id="bottom" position={Position.Bottom} style={handleStyle} />
      <Handle type="source" id="left" position={Position.Left} style={handleStyle} />
      <Handle type="source" id="right" position={Position.Right} style={handleStyle} />
      <Handle type="source" id="top" position={Position.Top} style={handleStyle} />
      <Handle type="source" id="bottom" position={Position.Bottom} style={handleStyle} />
      <span className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: `hsl(${hue} 80% 55%)` }}
        />
        <span className="truncate">{label ?? `미등록 지갑`}</span>
      </span>
      <span className="pl-4 font-mono text-[10px] text-neutral-400">
        {shortAddr(wallet)}
      </span>
      {(current || mine) && (
        <span className="mt-0.5 inline-flex gap-1 pl-4">
          {current && (
            <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-medium text-sky-300">
              현재 담당자
            </span>
          )}
          {mine && (
            <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-medium text-violet-300">
              나
            </span>
          )}
        </span>
      )}
    </div>
  );
}

const nodeTypes = { wallet: WalletFlowNode };

interface TransferFlowEdgeData {
  label: string | null;
  tx: string | null;
}

function TransferFlowEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    // borderRadius: 0 → 직각으로 꺾이는 라우팅
    borderRadius: 0,
    offset: 48,
  });
  // 화살표·선과 겹치지 않도록 라벨을 엣지 진행 방향의 수직 방향으로 밀어낸다.
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.hypot(dx, dy) || 1;
  const perpX = -dy / len;
  const perpY = dx / len;
  const lx = labelX + perpX * 20;
  const ly = labelY + perpY * 20;
  const { label, tx } = (data ?? {}) as unknown as TransferFlowEdgeData;
  const txHref = tx
    ? `https://explorer.solana.com/tx/${tx}${isSolanaMainnet() ? "" : "?cluster=devnet"}`
    : null;
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-auto absolute z-10 flex items-center gap-1.5 whitespace-nowrap rounded-md bg-[#0a0a0a]/95 px-2 py-0.5 font-mono text-[11px] font-semibold text-neutral-400"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          >
            {label}
            {txHref && (
              <a
                href={txHref}
                target="_blank"
                rel="noreferrer"
                title={tx ?? undefined}
                className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-400 transition-colors hover:bg-blue-500/30 hover:text-blue-300"
              >
                트랜잭션
              </a>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = { handover: TransferFlowEdge };

const formatTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function LineageGraph({
  asset,
  labels,
  transfers,
  currentManagedBy,
  viewer,
}: LineageGraphProps) {
  // 어느 지갑을 거쳐갔는지 순서 (연속 중복 제거)
  const pathWallets = useMemo(() => {
    const path: string[] = [];
    for (const t of transfers) {
      if (t.from && path[path.length - 1] !== t.from) path.push(t.from);
      if (path[path.length - 1] !== t.to) path.push(t.to);
    }
    return path;
  }, [transfers]);

  // 화살표(이동 단계) 별 이관: 첫 이관의 from이 null이면 시작점에 해당하는
  // 이관이 고정되지 않으므로 한 칸 건너뜀.
  const arrowTransfer = (arrowIdx: number): TransferEdge | null => {
    const skip = transfers[0]?.from ? 0 : 1;
    return transfers[arrowIdx + skip] ?? null;
  };

  const nodeId = (wallet: string, i: number) => `${wallet}-${i}`;

  // Boustrophedon: 홀수 행은 오른쪽→왼쪽으로 왕복 배치해 연속 S자 경로가 되게 한다.
  // 노드 간 간격은 가로·세로 동일하게 유지 (이전 대비 2배).
  const COLS = 3;
  const NODE_W = 208;
  const NODE_H = 84;
  const GAP = 144;
  const COL_W = NODE_W + GAP;
  const ROW_H = NODE_H + GAP;

  const nodes = useMemo(
    () =>
      pathWallets.map<Node>((w, i) => {
        const row = Math.floor(i / COLS);
        const col = i % COLS;
        const x = row % 2 === 0 ? col * COL_W : (COLS - 1 - col) * COL_W;
        return {
          id: nodeId(w, i),
          type: "wallet",
          position: { x, y: row * ROW_H },
          // 명시적 크기로 엣지 계산이 의존하지 않게 함
          width: NODE_W,
          height: NODE_H,
          data: {
            wallet: w,
            label: labels[w] ?? null,
            current: w === currentManagedBy,
            mine: w === viewer,
          },
        };
      }),
    [pathWallets, labels, currentManagedBy, viewer],
  );

  const edges = useMemo<Edge[]>(() => {
    const list: Edge[] = [];
    for (let i = 0; i < pathWallets.length - 1; i++) {
      const transfer = arrowTransfer(i);
      const time = transfer ? formatTime(transfer.at) : null;
      const row = Math.floor(i / COLS);
      const isRowTurn = (i + 1) % COLS === 0;
      // 행 끝에서 다음 행으로 넘어갈 때는 아래로 꺾여 연결.
      // 그 외에는 행 방향에 맞춰 좌/우 핸들을 맞교환하며 연결.
      let sourceHandle = "right";
      let targetHandle = "left";
      if (isRowTurn) {
        sourceHandle = "bottom";
        targetHandle = "top";
      } else if (row % 2 === 1) {
        sourceHandle = "left";
        targetHandle = "right";
      }
      list.push({
        id: `e-${i}`,
        source: nodeId(pathWallets[i], i),
        target: nodeId(pathWallets[i + 1], i + 1),
        sourceHandle,
        targetHandle,
        type: "handover",
        zIndex: 5,
        data: { label: time, tx: transfer?.tx ?? null },
        style: { stroke: "#e5e5e5", strokeWidth: 3 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: "#e5e5e5",
        },
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathWallets, transfers]);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-400">자산 이동 내역</h2>
        {transfers.length > 0 && (
          <span className="text-xs text-neutral-600">총 {transfers.length}건</span>
        )}
      </div>

      {transfers.length === 0 ? (
        <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-5 text-sm text-neutral-400">
          {asset.model_name}{" "}
          {currentManagedBy ? (
            <>
              이 자산은 현재 담당자 지갑{" "}
              <span className="font-mono text-xs">
                {currentManagedBy === viewer
                  ? "(" + shortAddr(currentManagedBy) + " — 나)"
                  : shortAddr(currentManagedBy)}
              </span>
              에 있습니다. 최초 이관이 발생하면 이동 내역이 기록됩니다.
            </>
          ) : (
            "현재 담당자가 지정되어 있지 않습니다."
          )}
        </div>
      ) : (
        <div
          className="mt-3 overflow-hidden rounded-xl border border-neutral-800 bg-[#0b0b0d]"
          style={{
            height: Math.max(
              360,
              Math.ceil(pathWallets.length / COLS) * ROW_H + 56,
            ),
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            colorMode="dark"
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.3}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="#2a2a2d" />
          </ReactFlow>
        </div>
      )}
    </section>
  );
}