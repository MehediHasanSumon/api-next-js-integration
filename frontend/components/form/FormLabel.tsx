interface FormLabelProps {
  text: string;
  htmlFor?: string;
  className?: string;
}

export default function FormLabel({ text, htmlFor, className = "" }: FormLabelProps) {
  return (
    <label htmlFor={htmlFor} className={`text-xs font-semibold uppercase tracking-wide text-slate-500 ${className}`}>
      {text}
    </label>
  );
}
