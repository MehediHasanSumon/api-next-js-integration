"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AxiosError } from "axios";
import api from "@/lib/axios";
import ProtectedShell from "@/components/ProtectedShell";
import Button from "@/components/Button";
import FormInput from "@/components/form/FormInput";
import FormLabel from "@/components/form/FormLabel";
import FormOptionCheckbox from "@/components/form/FormOptionCheckbox";

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
  const [showForm, setShowForm] = useState(false);
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

  const resetForm = (closeForm = false) => {
    setEditingId(null);
    setName("");
    setSelectedPermissions([]);
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

      resetForm(true);
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
    setShowForm(true);
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
    <ProtectedShell title="Roles Management" description="Create, Update, Delete roles">
      <div className="space-y-6">
        <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-soft">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Roles Management</h2>
              <p className="text-sm text-slate-500">Create, Update, Delete roles</p>
            </div>
            <button
              type="button"
              onClick={toggleForm}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {showForm ? "Close" : "Create Role"}
            </button>
          </div>
        </section>

        <div
          aria-hidden={!showForm}
          className={`overflow-hidden transition-all duration-300 ease-in-out ${showForm ? "max-h-[1200px] opacity-100 translate-y-0" : "max-h-0 opacity-0 -translate-y-2 pointer-events-none"}`}
        >
          <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-soft">
            <h3 className="text-sm font-semibold text-slate-900">{isEditMode ? "Update Role Form" : "Add Role Form"}</h3>

            <form onSubmit={handleSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
              <FormInput
                id="role-name"
                label="Role Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="example: manager"
                error={errors.name?.[0]}
                containerClassName="md:col-span-2"
              />

              <div className="md:col-span-2">
                <FormLabel text="Permissions" />
                <div className="mt-1.5 grid max-h-64 gap-2 overflow-y-auto rounded-xl border border-slate-300 bg-white px-3.5 py-3 sm:grid-cols-2 lg:grid-cols-3">
                  {permissions.length === 0 && <p className="text-xs text-slate-500">No permissions found</p>}
                  {permissions.map((permission) => (
                    <FormOptionCheckbox
                      key={permission.id}
                      label={permission.name}
                      checked={selectedPermissions.includes(permission.name)}
                      onChange={() => togglePermission(permission.name)}
                    />
                  ))}
                </div>
                {errors.permissions?.[0] && <p className="mt-1 text-xs text-rose-600">{errors.permissions[0]}</p>}
              </div>

              {errors.general && <p className="text-xs text-amber-600 md:col-span-2">{errors.general[0]}</p>}

              <div className="flex gap-2 md:col-span-2">
                <Button type="submit" disabled={submitting} loading={submitting} className="w-full sm:w-auto">
                  {isEditMode ? "Update Role" : "Create Role"}
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
          <h2 className="text-sm font-semibold text-slate-900">Roles Table</h2>
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
