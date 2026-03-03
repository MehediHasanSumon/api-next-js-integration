interface FormCheckboxProps {
  label: string;
  checked: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  description?: string;
  error?: string;
  name?: string;
}

export default function FormCheckbox({ label, checked, onChange, description, error, name }: FormCheckboxProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
      <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          name={name}
          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          checked={checked}
          onChange={onChange}
        />
        {label}
      </label>
      {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
