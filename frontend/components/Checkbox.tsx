interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export default function Checkbox({ label, className = "", ...props }: CheckboxProps) {
  return (
    <label className="flex items-center cursor-pointer">
      <input
        type="checkbox"
        className={`mr-2 cursor-pointer ${className}`}
        {...props}
      />
      <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
    </label>
  );
}
