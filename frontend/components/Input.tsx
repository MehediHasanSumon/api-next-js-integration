interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export default function Input({ label, error, className = "", ...props }: InputProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
      <input
        className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm bg-white dark:bg-slate-700 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none ${
          error ? "border-red-500 focus:border-red-500" : "border-slate-200 dark:border-slate-600 focus:border-blue-500"
        } ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
