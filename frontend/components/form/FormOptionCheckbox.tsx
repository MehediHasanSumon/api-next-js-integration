interface FormOptionCheckboxProps {
  label: string;
  checked: boolean;
  onChange: () => void;
}

export default function FormOptionCheckbox({ label, checked, onChange }: FormOptionCheckboxProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        checked={checked}
        onChange={onChange}
      />
      {label}
    </label>
  );
}
