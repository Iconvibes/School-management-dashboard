import { GraduationCap } from "lucide-react";

export default function Logo({ light = false, size = "md" }) {
  const textSize = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-lg";
  const box = size === "lg" ? "h-10 w-10 rounded-xl" : size === "sm" ? "h-7 w-7 rounded-lg" : "h-8 w-8 rounded-lg";
  const icon = size === "lg" ? "h-5 w-5" : "h-4 w-4";

  return (
    <div className="flex items-center gap-2.5">
      <div className={`${box} flex items-center justify-center bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30`}>
        <GraduationCap className={icon} />
      </div>
      <span className={`${textSize} font-bold tracking-tight ${light ? "text-white" : "text-navy-800"}`}>
        Edu<span className={light ? "text-brand-300" : "text-brand-600"}>track</span>
      </span>
    </div>
  );
}
