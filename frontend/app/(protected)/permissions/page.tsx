"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AxiosError } from "axios";
import api from "@/lib/axios";
import ProtectedShell from "@/components/ProtectedShell";
import Input from "@/components/Input";
import Button from "@/components/Button";

interface Permission {
  id: number;
  name: string;
}

export default function PermissionManagementPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const isEditMode = useMemo(() => editingId !== null, [editingId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await api.get("/admin/permissions");
      setPermissions(response.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setErrors({});
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setSubmitting(true);

    try {
      if (isEditMode && editingId !== null) {
        await api.put(`/admin/permissions/${editingId}`, { name });
      } else {
        await api.post("/admin/permissions", { name });
      }

      resetForm();
      await loadData();
    } catch (error) {
      const axiosError = error as AxiosError<{ errors?: Record<string, string[]>; message?: string }>;
      if (axiosError.response?.data?.errors) {
        setErrors(axiosError.response.data.errors);
      } else {
        setErrors({ general: [axiosError.response?.data?.message || "Failed to save permission"] });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (permission: Permission) => {
    setEditingId(permission.id);
    setName(permission.name);
    setErrors({});
  };

  const handleDelete = async (permissionId: number) => {
    if (!window.confirm("Delete this permission?")) {
      return;
    }

    try {
      await api.delete(`/admin/permissions/${permissionId}`);
      await loadData();
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setErrors({ general: [axiosError.response?.data?.message || "Failed to delete permission"] });
    }
  };

  return (
    <ProtectedShell title="Permission Managements" description="Create and manage permissions for both web and mobile roles.">
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-slate-900">{isEditMode ? "Update Permission" : "Create Permission"}</h2>
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <Input
              label="Permission Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="example: users.view"
              error={errors.name?.[0]}
            />
            {errors.general && <p className="text-xs text-amber-600">{errors.general[0]}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={submitting} loading={submitting} className="w-full">
                {isEditMode ? "Update Permission" : "Create Permission"}
              </Button>
              {isEditMode && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-slate-900">Permissions List</h2>
          {loading ? (
            <p className="mt-4 text-sm text-slate-500">Loading permissions...</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-2 py-2 font-medium">Permission</th>
                    <th className="px-2 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {permissions.map((permission) => (
                    <tr key={permission.id} className="border-b border-slate-100 text-slate-700">
                      <td className="px-2 py-2 font-medium">{permission.name}</td>
                      <td className="px-2 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(permission)}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(permission.id)}
                            className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </ProtectedShell>
  );
}
