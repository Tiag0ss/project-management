'use client';

import { Task } from '@/lib/api/tasks';

interface DGNode {
  task: Task;
  level: number;
  indexInLevel: number;
  x: number;
  y: number;
}

export function DependencyGraphTab({ tasks, onOpenTask }: { tasks: Task[]; onOpenTask: (t: Task) => void }) {
  const BOX_W = 170;
  const BOX_H = 54;
  const COL_GAP = 100;
  const ROW_GAP = 28;

  // Build adjacency (id → task)
  const byId = new Map<number, Task>(tasks.map(t => [t.Id, t]));

  // Compute level for each task via longest-path BFS
  const levelMap = new Map<number, number>();
  const dependants = new Map<number, number[]>(); // depId → [taskId...]
  tasks.forEach(t => {
    if (t.DependsOnTaskId && byId.has(t.DependsOnTaskId)) {
      const arr = dependants.get(t.DependsOnTaskId) || [];
      arr.push(t.Id);
      dependants.set(t.DependsOnTaskId, arr);
    }
  });
  // Iterative level assignment
  let changed = true;
  tasks.forEach(t => levelMap.set(t.Id, 0));
  while (changed) {
    changed = false;
    tasks.forEach(t => {
      if (t.DependsOnTaskId && byId.has(t.DependsOnTaskId)) {
        const nl = (levelMap.get(t.DependsOnTaskId) ?? 0) + 1;
        if (nl > (levelMap.get(t.Id) ?? 0)) {
          levelMap.set(t.Id, nl);
          changed = true;
        }
      }
    });
  }

  // Only diagram tasks that have deps or are depended upon
  const linkedIds = new Set<number>();
  tasks.forEach(t => {
    if (t.DependsOnTaskId && byId.has(t.DependsOnTaskId)) {
      linkedIds.add(t.Id);
      linkedIds.add(t.DependsOnTaskId);
    }
  });
  const diagramTasks = tasks.filter(t => linkedIds.has(t.Id));

  // Group by level
  const levelGroups = new Map<number, Task[]>();
  diagramTasks.forEach(t => {
    const lv = levelMap.get(t.Id) ?? 0;
    const arr = levelGroups.get(lv) || [];
    arr.push(t);
    levelGroups.set(lv, arr);
  });

  // Sort levels
  const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);

  // Assign positions
  const nodes = new Map<number, DGNode>();
  let svgWidth = 20;
  sortedLevels.forEach((lv, colIdx) => {
    const col = levelGroups.get(lv)!;
    col.sort((a, b) => a.TaskName.localeCompare(b.TaskName));
    col.forEach((task, rowIdx) => {
      const x = 20 + colIdx * (BOX_W + COL_GAP);
      const y = 20 + rowIdx * (BOX_H + ROW_GAP);
      nodes.set(task.Id, { task, level: lv, indexInLevel: rowIdx, x, y });
    });
    const rightEdge = 20 + colIdx * (BOX_W + COL_GAP) + BOX_W + 20;
    if (rightEdge > svgWidth) svgWidth = rightEdge;
  });

  const maxRows = Math.max(...Array.from(levelGroups.values()).map(g => g.length), 1);
  const svgHeight = 20 + maxRows * (BOX_H + ROW_GAP) + 20;

  // Edge list
  const edges: { from: DGNode; to: DGNode }[] = [];
  diagramTasks.forEach(t => {
    if (t.DependsOnTaskId && nodes.has(t.DependsOnTaskId) && nodes.has(t.Id)) {
      edges.push({ from: nodes.get(t.DependsOnTaskId)!, to: nodes.get(t.Id)! });
    }
  });

  const statusColor = (s?: string | null) => {
    const sl = (s || '').toLowerCase();
    if (sl.includes('done') || sl.includes('complet')) return '#22c55e';
    if (sl.includes('progress') || sl.includes('doing')) return '#3b82f6';
    if (sl.includes('block') || sl.includes('cancel')) return '#ef4444';
    return '#94a3b8';
  };

  if (diagramTasks.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-10 text-center">
        <div className="text-5xl mb-4">🔗</div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Task Dependencies</h2>
        <p className="text-gray-500 dark:text-gray-400">
          Set a <strong>Depends On</strong> value on any task to see the dependency graph here.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="mb-4 flex items-center justify-end">
        <span className="text-sm text-gray-500 dark:text-gray-400">{diagramTasks.length} linked tasks · click to open</span>
      </div>
      <div className="overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <svg width={svgWidth} height={svgHeight} style={{ minWidth: svgWidth, display: 'block' }}>
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#64748b" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map(({ from, to }, i) => {
            const x1 = from.x + BOX_W;
            const y1 = from.y + BOX_H / 2;
            const x2 = to.x;
            const y2 = to.y + BOX_H / 2;
            const mx = (x1 + x2) / 2;
            return (
              <path
                key={i}
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke="#64748b"
                strokeWidth="1.5"
                markerEnd="url(#arrowhead)"
              />
            );
          })}

          {/* Nodes */}
          {Array.from(nodes.values()).map(({ task, x, y }) => {
            const sc = statusColor(task.StatusName);
            const label = task.TaskName.length > 22 ? task.TaskName.slice(0, 21) + '…' : task.TaskName;
            return (
              <g key={task.Id} style={{ cursor: 'pointer' }} onClick={() => onOpenTask(task)}>
                <rect
                  x={x}
                  y={y}
                  width={BOX_W}
                  height={BOX_H}
                  rx={8}
                  fill="white"
                  stroke={sc}
                  strokeWidth={2}
                  filter="drop-shadow(0 1px 2px rgba(0,0,0,0.10))"
                />
                {/* Status stripe */}
                <rect x={x} y={y} width={6} height={BOX_H} rx={8} fill={sc} />
                <rect x={x} y={y + 6} width={6} height={BOX_H - 6} fill={sc} />
                <text
                  x={x + 14}
                  y={y + 21}
                  fontSize={12}
                  fontWeight="600"
                  fill="#1e293b"
                  fontFamily="system-ui, sans-serif"
                >
                  {label}
                </text>
                {task.StatusName && (
                  <text
                    x={x + 14}
                    y={y + 37}
                    fontSize={10}
                    fill={sc}
                    fontFamily="system-ui, sans-serif"
                  >
                    {task.StatusName.length > 24 ? task.StatusName.slice(0, 23) + '…' : task.StatusName}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-500" /> Completed/Done</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-blue-500" /> In Progress</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500" /> Blocked/Cancelled</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-slate-400" /> Other</span>
      </div>
    </div>
  );
}
