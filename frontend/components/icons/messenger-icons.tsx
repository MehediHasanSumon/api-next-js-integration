import type { SVGProps } from "react";
import {
  CameraIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  InfoIcon,
  MicIcon,
  PaperclipIcon,
  SearchIcon,
  VideoIcon,
} from "lucide-react";

type IconProps = SVGProps<SVGSVGElement>;

export function MessengerSearchIcon(props: IconProps) {
  return <SearchIcon {...props} />;
}

export function MessengerVideoIcon(props: IconProps) {
  return <VideoIcon {...props} />;
}

export function MessengerMicIcon(props: IconProps) {
  return <MicIcon {...props} />;
}

export function MessengerInfoIcon(props: IconProps) {
  return <InfoIcon {...props} />;
}

export function MessengerAttachmentIcon(props: IconProps) {
  return <PaperclipIcon {...props} />;
}

export function MessengerCameraIcon(props: IconProps) {
  return <CameraIcon {...props} />;
}

export function MessengerChevronLeftIcon(props: IconProps) {
  return <ChevronLeftIcon {...props} />;
}

export function MessengerChevronRightIcon(props: IconProps) {
  return <ChevronRightIcon {...props} />;
}
