"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useClub } from "@/contexts/ClubContext";
import type { ClubMemberWithEmail, ClubMemberRole } from "@/types/database";

export default function MembersPage() {
  const router = useRouter();
  const { selectedClub, isLoading: clubLoading, isOwner } = useClub();
  const [members, setMembers] = useState<ClubMemberWithEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add member form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"editor" | "viewer">("viewer");
  const [addingMember, setAddingMember] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Transfer ownership state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTarget, setTransferTarget] = useState<ClubMemberWithEmail | null>(null);
  const [transferring, setTransferring] = useState(false);

  // Remove member state
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ClubMemberWithEmail | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    // Redirect non-owners to dashboard
    if (!clubLoading && !isOwner) {
      router.push("/dashboard");
      return;
    }

    if (selectedClub && isOwner) {
      loadMembers();
    } else if (!clubLoading) {
      setLoading(false);
    }
  }, [selectedClub, clubLoading, isOwner, router]);

  const loadMembers = async () => {
    if (!selectedClub) return;

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: fetchError } = await supabase
      .rpc("get_club_members_with_email", { p_club_id: selectedClub.id });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setMembers((data as ClubMemberWithEmail[]) || []);
    }

    setLoading(false);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClub) return;

    setAddingMember(true);
    setAddError(null);

    const supabase = createClient();
    const { error: addMemberError } = await supabase
      .rpc("add_club_member_by_email", {
        p_club_id: selectedClub.id,
        p_email: newEmail,
        p_role: newRole,
      });

    if (addMemberError) {
      setAddError(addMemberError.message);
    } else {
      setNewEmail("");
      setNewRole("viewer");
      setShowAddForm(false);
      loadMembers();
    }

    setAddingMember(false);
  };

  const handleRoleChange = async (memberId: string, newMemberRole: ClubMemberRole) => {
    const supabase = createClient();
    const { error: updateError } = await supabase
      .rpc("update_club_member_role", {
        p_member_id: memberId,
        p_new_role: newMemberRole,
      });

    if (updateError) {
      alert(updateError.message);
    } else {
      loadMembers();
    }
  };

  const handleRemoveMember = async () => {
    if (!removeTarget) return;

    setRemoving(true);

    const supabase = createClient();
    const { error: removeError } = await supabase
      .rpc("remove_club_member", { p_member_id: removeTarget.id });

    if (removeError) {
      alert(removeError.message);
    } else {
      setShowRemoveModal(false);
      setRemoveTarget(null);
      loadMembers();
    }

    setRemoving(false);
  };

  const handleTransferOwnership = async () => {
    if (!transferTarget || !selectedClub) return;

    setTransferring(true);

    const supabase = createClient();
    const { error: transferError } = await supabase
      .rpc("transfer_club_ownership", {
        p_club_id: selectedClub.id,
        p_new_owner_id: transferTarget.user_id,
      });

    if (transferError) {
      alert(transferError.message);
      setTransferring(false);
    } else {
      // Refresh the page to update context
      router.push("/dashboard");
      router.refresh();
    }
  };

  if (clubLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!selectedClub) {
    return (
      <div className="py-12 text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          No club selected
        </h2>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          Create a club to manage members.
        </p>
        <Link
          href="/dashboard/clubs/new"
          className="mt-4 inline-block rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
        >
          Create Club
        </Link>
      </div>
    );
  }

  if (!isOwner) {
    return null; // Will redirect
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Members
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Manage who has access to {selectedClub.short_name}.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Add Member
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/50 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Role Legend */}
      <div className="mb-6 flex flex-wrap gap-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
            Owner
          </span>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Full access, can manage members and settings
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
            Editor
          </span>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Can edit records and lists
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
            Viewer
          </span>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Read-only access
          </span>
        </div>
      </div>

      {/* Members Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Joined
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {members.map((member) => (
              <tr key={member.id}>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">
                  {member.email}
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  {member.role === "owner" ? (
                    <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                      Owner
                    </span>
                  ) : (
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.id, e.target.value as ClubMemberRole)}
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  )}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {new Date(member.created_at).toLocaleDateString()}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                  {member.role === "owner" ? (
                    <span className="text-gray-400">(You)</span>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setTransferTarget(member);
                          setShowTransferModal(true);
                        }}
                        className="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
                      >
                        Transfer Ownership
                      </button>
                      <button
                        onClick={() => {
                          setRemoveTarget(member);
                          setShowRemoveModal(true);
                        }}
                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Member Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Add Member
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              The user must already have an account with this email address.
            </p>

            <form onSubmit={handleAddMember} className="mt-4 space-y-4">
              {addError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/50 dark:text-red-400">
                  {addError}
                </div>
              )}

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  placeholder="user@example.com"
                />
              </div>

              <div>
                <label
                  htmlFor="role"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Role
                </label>
                <select
                  id="role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as "editor" | "viewer")}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="viewer">Viewer - Read-only access</option>
                  <option value="editor">Editor - Can edit records</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setAddError(null);
                    setNewEmail("");
                    setNewRole("viewer");
                  }}
                  disabled={addingMember}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingMember}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {addingMember ? "Adding..." : "Add Member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove Member Modal */}
      {showRemoveModal && removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Remove Member
            </h3>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Are you sure you want to remove{" "}
              <span className="font-medium">{removeTarget.email}</span> from{" "}
              {selectedClub.short_name}? They will lose access to all club data.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRemoveModal(false);
                  setRemoveTarget(null);
                }}
                disabled={removing}
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveMember}
                disabled={removing}
                className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {removing ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Ownership Modal */}
      {showTransferModal && transferTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Transfer Ownership
            </h3>
            <div className="mt-2 space-y-2 text-gray-600 dark:text-gray-400">
              <p>
                Are you sure you want to transfer ownership of{" "}
                <span className="font-medium">{selectedClub.short_name}</span> to{" "}
                <span className="font-medium">{transferTarget.email}</span>?
              </p>
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                <strong>Warning:</strong> You will be demoted to Editor and lose the
                ability to manage members, change settings, or delete the club.
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowTransferModal(false);
                  setTransferTarget(null);
                }}
                disabled={transferring}
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleTransferOwnership}
                disabled={transferring}
                className="rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {transferring ? "Transferring..." : "Transfer Ownership"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
