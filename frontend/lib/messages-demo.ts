export interface MessageThreadSummary {
  id: string;
  name: string;
  handle: string;
  lastMessage: string;
  lastTime: string;
  unread: number;
  pinned?: boolean;
  online?: boolean;
}

export interface ChatMessage {
  id: string;
  from: "me" | "them";
  text: string;
  time: string;
}

export const threadSummaries: MessageThreadSummary[] = [
  {
    id: "kjdfndsfnkdn",
    name: "Support Team",
    handle: "@support",
    lastMessage: "Can you share the latest status update?",
    lastTime: "2m",
    unread: 2,
    pinned: true,
    online: true,
  },
  {
    id: "sales-room-01",
    name: "Sales Team",
    handle: "@sales",
    lastMessage: "Lead follow-up done. Waiting for response.",
    lastTime: "18m",
    unread: 0,
    online: true,
  },
  {
    id: "ops-war-room",
    name: "Operations",
    handle: "@ops",
    lastMessage: "Server patch deployed in production.",
    lastTime: "1h",
    unread: 5,
    pinned: true,
  },
  {
    id: "design-lab",
    name: "Design Lab",
    handle: "@design",
    lastMessage: "Updated the chat card layout. Please review.",
    lastTime: "3h",
    unread: 0,
  },
];

export const threadMessages: Record<string, ChatMessage[]> = {
  kjdfndsfnkdn: [
    { id: "m1", from: "them", text: "Hello, can you confirm the deployment status?", time: "10:42 AM" },
    { id: "m2", from: "me", text: "Deployment is completed. Monitoring is running.", time: "10:44 AM" },
    { id: "m3", from: "them", text: "Perfect. Please share logs in the evening.", time: "10:45 AM" },
  ],
  "sales-room-01": [
    { id: "m4", from: "them", text: "Client asked for revised pricing.", time: "09:12 AM" },
    { id: "m5", from: "me", text: "Share the updated sheet, I will validate.", time: "09:16 AM" },
  ],
  "ops-war-room": [
    { id: "m6", from: "them", text: "Patch completed in production.", time: "08:05 AM" },
    { id: "m7", from: "them", text: "CPU is stable now.", time: "08:07 AM" },
    { id: "m8", from: "me", text: "Great, keep alerting enabled for 24h.", time: "08:10 AM" },
  ],
  "design-lab": [
    { id: "m9", from: "them", text: "New icon set exported.", time: "Yesterday" },
    { id: "m10", from: "me", text: "Looks clean. Ship it.", time: "Yesterday" },
  ],
};
