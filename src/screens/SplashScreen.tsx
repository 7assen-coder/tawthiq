import { useEffect } from "react";
import { motion } from "framer-motion";
import { LogoMark } from "@/components/Logo";

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      className="h-full w-full flex flex-col items-center justify-center"
      style={{
        background: "linear-gradient(160deg, #0A555B, #0E6E76 60%, #12878C)",
      }}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="flex flex-col items-center gap-4"
      >
        <LogoMark size={72} />
        <h1 className="text-white font-[800] text-[26px] tracking-tight">
          Tawthiq
        </h1>
        <p className="text-white/50 text-[12px] tracking-widest">
          Rapprochement CNAM · OLIVEX
        </p>
      </motion.div>

      {/* Gold progress bar */}
      <div className="absolute bottom-16 w-40 h-1 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: "#C9962B" }}
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: 1.8, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}
