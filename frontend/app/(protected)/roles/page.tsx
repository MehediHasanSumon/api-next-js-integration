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

interface Role {
  id: number;
  name: string;
  permissions: Permission[];
}

export default function RolesManagementPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const [name, setName] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const isEditMode = useMemo(() => editingId !== null, [editingId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rolesResponse, permissionsResponse] = await Promise.all([api.get("/admin/roles"), api.get("/admin/permissions")]);
      setRoles(rolesResponse.data);
      setPermissions(permissionsResponse.data);
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
    setSelectedPermissions([]);
    setErrors({});
  };

  const togglePermission = (permissionName: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permissionName) ? prev.filter((value) => value !== permissionName) : [...prev, permissionName]
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setSubmitting(true);

    const payload = {
      name,
      permissions: selectedPermissions,
    };

    try {
      if (isEditMode && editingId !== null) {
        await api.put(`/admin/roles/${editingId}`, payload);
      } else {
        await api.post("/admin/roles", payload);
      }

      resetForm();
      await loadData();
    } catch (error) {
      const axiosError = error as AxiosError<{ errors?: Record<string, string[]>; message?: string }>;
      if (axiosError.response?.data?.errors) {
        setErrors(axiosError.response.data.errors);
      } else {
        setErrors({ general: [axiosError.response?.data?.message || "Failed to save role"] });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (role: Role) => {
    setEditingId(role.id);
    setName(role.name);
    setSelectedPermissions(role.permissions.map((permission) => permission.name));
    setErrors({});
  };

  const handleDelete = async (roleId: number) => {
    if (!window.confirm("Delete this role?")) {
      return;
    }

    try {
      await api.delete(`/admin/roles/${roleId}`);
      await loadData();
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setErrors({ general: [axiosError.response?.data?.message || "Failed to delete role"] });
    }
  };

  return (
    <ProtectedShell title="Roles Managements" description="Manage role definitions and map permissions.">
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-slate-900">{isEditMode ? "Update Role" : "Create Role"}</h2>
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <Input label="Role Name" value={name} onChange={(event) => setName(event.target.value)} error={errors.name?.[0]} />

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Attach Permissions</p>
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
                {permissions.length === 0 && <p className="text-xs text-slate-500">No permissions found</p>}
                {permissions.map((permission) => (
                  <label key={permission.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedPermissions.includes(permission.name)}
                      onChange={() => togglePermission(permission.name)}
                    />
                    {permission.name}
                  </label>
                ))}
              </div>
            </div>

            {errors.general && <p className="text-xs text-amber-600">{errors.general[0]}</p>}

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting} loading={submitting} className="w-full">
                {isEditMode ? "Update Role" : "Create Role"}
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
          <h2 className="text-sm font-semibold text-slate-900">Roles List</h2>
          {loading ? (
            <p className="mt-4 text-sm text-slate-500">Loading roles...</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-2 py-2 font-medium">Role</th>
                    <th className="px-2 py-2 font-medium">Permissions</th>
                    <th className="px-2 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={role.id} className="border-b border-slate-100 text-slate-700">
                      <td className="px-2 py-2 font-medium">{role.name}</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          {role.permissions.length === 0 && <span className="text-xs text-slate-400">No permission</span>}
                          {role.permissions.map((permission) => (
                            <span key={permission.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                              {permission.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(role)}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(role.id)}
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
