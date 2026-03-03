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
        className={`mt-1.5 w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 ${
          error ? "border-rose-400 focus:border-rose-400" : "border-slate-300 focus:border-blue-500"
        } ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
