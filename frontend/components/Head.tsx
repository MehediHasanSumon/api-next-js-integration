"use client";

import { useEffect } from "react";

interface HeadProps {
  children: React.ReactNode;
}

export default function Head({ children }: HeadProps) {
  useEffect(() => {
    const childArray = Array.isArray(children) ? children : [children];
    const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Md Mehedi Hasan';

    childArray.forEach((child) => {
      if (!child || typeof child !== 'object') return;

      const element = child as { type: string; props: { children?: string; name?: string; content?: string } };

      if (element.type === 'title' && element.props?.children) {
        document.title = `${element.props.children} - ${appName}`;
      }
      if (element.type === 'meta' && element.props?.name === 'description' && element.props?.content) {
        let metaDesc = document.querySelector('meta[name="description"]');
        if (!metaDesc) {
          metaDesc = document.createElement('meta');
          metaDesc.setAttribute('name', 'description');
          document.head.appendChild(metaDesc);
        }
        metaDesc.setAttribute('content', element.props.content);
      }
    });
  }, [children]);

  return null;
}
