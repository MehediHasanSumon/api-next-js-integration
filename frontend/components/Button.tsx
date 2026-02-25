interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  children: React.ReactNode;
}

export default function Button({ loading, children, className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`w-full rounded-xl bg-blue-600 dark:bg-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-blue-400 dark:disabled:bg-blue-700 disabled:cursor-not-allowed cursor-pointer ${className}`}
      {...props}
    >
      {loading ? "Loading..." : children}
    </button>
  );
}
