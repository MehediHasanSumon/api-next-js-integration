"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AxiosError } from "axios";
import api from "@/lib/axios";
import ProtectedShell from "@/components/ProtectedShell";
import Button from "@/components/Button";
import FormInput from "@/components/form/FormInput";

interface Permission {
  id: number;
  name: string;
}

export default function PermissionManagementPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
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

  const resetForm = (closeForm = false) => {
    setEditingId(null);
    setName("");
    setErrors({});

    if (closeForm) {
      setShowForm(false);
    }
  };

  const toggleForm = () => {
    if (showForm) {
      resetForm(true);
      return;
    }

    setShowForm(true);
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

      resetForm(true);
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
    setShowForm(true);
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
    <ProtectedShell title="Permission Management" description="Create, Update, Delete permissions">
      <div className="space-y-6">
        <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-soft">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Permission Management</h2>
              <p className="text-sm text-slate-500">Create, Update, Delete permissions</p>
            </div>
            <button
              type="button"
              onClick={toggleForm}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {showForm ? "Close" : "Create Permission"}
            </button>
          </div>
        </section>

        <div
          aria-hidden={!showForm}
          className={`overflow-hidden transition-all duration-300 ease-in-out ${showForm ? "max-h-[520px] opacity-100 translate-y-0" : "max-h-0 opacity-0 -translate-y-2 pointer-events-none"}`}
        >
          <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-soft">
            <h3 className="text-sm font-semibold text-slate-900">{isEditMode ? "Update Permission Form" : "Add Permission Form"}</h3>
            <form onSubmit={handleSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
              <FormInput
                id="permission-name"
                label="Permission Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="example: users.view"
                error={errors.name?.[0]}
                containerClassName="md:col-span-2"
              />

              {errors.general && <p className="text-xs text-amber-600 md:col-span-2">{errors.general[0]}</p>}

              <div className="flex gap-2 md:col-span-2">
                <Button type="submit" disabled={submitting} loading={submitting} className="w-full sm:w-auto">
                  {isEditMode ? "Update Permission" : "Create Permission"}
                </Button>
                <button
                  type="button"
                  onClick={() => resetForm(true)}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>

        <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-slate-900">Permissions Table</h2>
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
