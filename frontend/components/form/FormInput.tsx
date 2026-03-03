import FormLabel from "@/components/form/FormLabel";

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  containerClassName?: string;
}

export default function FormInput({ label, error, id, containerClassName = "", className = "", ...props }: FormInputProps) {
  return (
    <div className={containerClassName}>
      <FormLabel text={label} htmlFor={id} />
      <input
        id={id}
        className={`mt-1.5 h-10 w-full rounded-md border bg-white px-3 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
          error
            ? "border-rose-400 focus-visible:border-rose-500 focus-visible:ring-rose-500"
            : "border-slate-300 focus-visible:border-blue-500 focus-visible:ring-blue-500"
        } ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
