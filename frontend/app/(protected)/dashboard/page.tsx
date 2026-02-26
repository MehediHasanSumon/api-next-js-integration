"use client";

import { useEffect, useState } from "react";
import api from "@/lib/axios";

export default function Dashboard() {
  const [user, setUser] = useState<{ id: number; name: string; email: string } | null>(null);
  const [packets, setPackets] = useState<{ 
    id: number; 
    timestamp: string; 
    sourceIp: string;
    destIp: string;
    protocol: string;
    port: number;
    size: number; 
    latency: number;
    status: string 
  }[]>([]);
  const [currentSpeed, setCurrentSpeed] = useState(0);

  useEffect(() => {
    api.get('/user').then((res) => setUser(res.data));
  }, []);

  useEffect(() => {
    let packetId = 1;
    const protocols = ["TCP", "UDP", "HTTP", "HTTPS"];
    const interval = setInterval(() => {
      const newSpeed = Math.random() * 100;
      setCurrentSpeed(newSpeed);
      
      const newPacket = {
        id: packetId++,
        timestamp: new Date().toLocaleTimeString(),
        sourceIp: `192.168.1.${Math.floor(Math.random() * 255)}`,
        destIp: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        protocol: protocols[Math.floor(Math.random() * protocols.length)],
        port: Math.floor(Math.random() * 65535),
        size: Math.floor(Math.random() * 1500) + 500,
        latency: Math.floor(Math.random() * 100) + 10,
        status: Math.random() > 0.1 ? "Success" : "Failed"
      };
      
      setPackets((prev) => {
        const updated = [newPacket, ...prev];
        return updated.slice(0, 10);
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-black dark:text-white">
          Dashboard
        </h1>

        <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4 text-black dark:text-white">
            User Information
          </h2>
          <div className="space-y-2">
            <p className="text-zinc-700 dark:text-zinc-300"><span className="font-semibold">Name:</span> {user?.name}</p>
            <p className="text-zinc-700 dark:text-zinc-300"><span className="font-semibold">Email:</span> {user?.email}</p>
            <p className="text-zinc-700 dark:text-zinc-300"><span className="font-semibold">ID:</span> {user?.id}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-2 text-black dark:text-white">
            Current Speed
          </h2>
          <p className="text-5xl font-bold text-blue-600">
            {currentSpeed.toFixed(2)} Mbps
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4 text-black dark:text-white">
            Packet Trace
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-300 dark:border-zinc-700">
                  <th className="text-left py-3 px-4 text-zinc-700 dark:text-zinc-300">ID</th>
                  <th className="text-left py-3 px-4 text-zinc-700 dark:text-zinc-300">Timestamp</th>
                  <th className="text-left py-3 px-4 text-zinc-700 dark:text-zinc-300">Source IP</th>
                  <th className="text-left py-3 px-4 text-zinc-700 dark:text-zinc-300">Dest IP</th>
                  <th className="text-left py-3 px-4 text-zinc-700 dark:text-zinc-300">Protocol</th>
                  <th className="text-left py-3 px-4 text-zinc-700 dark:text-zinc-300">Port</th>
                  <th className="text-left py-3 px-4 text-zinc-700 dark:text-zinc-300">Size (bytes)</th>
                  <th className="text-left py-3 px-4 text-zinc-700 dark:text-zinc-300">Latency (ms)</th>
                  <th className="text-left py-3 px-4 text-zinc-700 dark:text-zinc-300">Status</th>
                </tr>
              </thead>
              <tbody>
                {packets.map((packet) => (
                  <tr key={packet.id} className="border-b border-zinc-200 dark:border-zinc-800">
                    <td className="py-3 px-4 text-zinc-900 dark:text-zinc-100">#{packet.id}</td>
                    <td className="py-3 px-4 text-zinc-900 dark:text-zinc-100">{packet.timestamp}</td>
                    <td className="py-3 px-4 text-zinc-900 dark:text-zinc-100">{packet.sourceIp}</td>
                    <td className="py-3 px-4 text-zinc-900 dark:text-zinc-100">{packet.destIp}</td>
                    <td className="py-3 px-4 text-zinc-900 dark:text-zinc-100">{packet.protocol}</td>
                    <td className="py-3 px-4 text-zinc-900 dark:text-zinc-100">{packet.port}</td>
                    <td className="py-3 px-4 text-zinc-900 dark:text-zinc-100">{packet.size}</td>
                    <td className="py-3 px-4 text-zinc-900 dark:text-zinc-100">{packet.latency}ms</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-sm ${
                        packet.status === "Success" 
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" 
                          : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      }`}>
                        {packet.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {packets.length === 0 && (
              <p className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                Waiting for packets...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
