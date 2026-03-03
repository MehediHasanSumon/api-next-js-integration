interface TableSkeletonProps {
  columns: number;
  rows?: number;
}

export default function TableSkeleton({ columns, rows = 5 }: TableSkeletonProps) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            {Array.from({ length: columns }).map((_, index) => (
              <th key={index} className="px-2 py-2">
                <div className="h-4 w-20 animate-pulse rounded bg-slate-200"></div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex} className="border-b border-slate-100">
              {Array.from({ length: columns }).map((__, colIndex) => (
                <td key={`${rowIndex}-${colIndex}`} className="px-2 py-3">
                  <div className="h-4 w-full max-w-[180px] animate-pulse rounded bg-slate-200"></div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
