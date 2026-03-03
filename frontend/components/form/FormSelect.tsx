import FormLabel from "@/components/form/FormLabel";

interface SelectOption {
  value: string;
  label: string;
}

interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  error?: string;
  containerClassName?: string;
}

export default function FormSelect({
  label,
  options,
  error,
  id,
  containerClassName = "",
  className = "",
  ...props
}: FormSelectProps) {
  return (
    <div className={containerClassName}>
      <FormLabel text={label} htmlFor={id} />
      <select
        id={id}
        className={`mt-1.5 h-10 w-full rounded-md border bg-white px-3 text-sm text-slate-900 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
          error
            ? "border-rose-400 focus-visible:border-rose-500 focus-visible:ring-rose-500"
            : "border-slate-300 focus-visible:border-blue-500 focus-visible:ring-blue-500"
        } ${className}`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
