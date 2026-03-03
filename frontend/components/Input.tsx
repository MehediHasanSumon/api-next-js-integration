interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export default function Input({ label, error, className = "", ...props }: InputProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
      <input
        className={`mt-1.5 h-10 w-full rounded-md border px-3 text-sm bg-white text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 dark:bg-slate-700 dark:text-white dark:placeholder:text-slate-500 ${
          error
            ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500"
            : "border-slate-300 dark:border-slate-600 focus-visible:border-blue-500 focus-visible:ring-blue-500"
        } ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
