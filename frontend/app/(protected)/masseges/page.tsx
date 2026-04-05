import { redirect } from "next/navigation";

export default function LegacyMessagesPage() {
  redirect("/messages");
}
