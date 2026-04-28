import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import "leaflet/dist/leaflet.css";
import GeoLocModule from "@/geoloc/GeoLocModule";

const GeoLocPage = () => {
  // Hide the html overflow lock that the GeoLoc original CSS expects.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="geoloc-root fixed inset-0 z-40 flex flex-col">
      <div className="absolute left-3 top-3 z-[2000]">
        <Link
          to="/"
          className="flex items-center gap-1.5 rounded-full border border-border/60 bg-surface/80 px-3 py-1 text-[12px] font-medium text-foreground backdrop-blur-2xl hover:bg-surface-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Inicio
        </Link>
      </div>
      <GeoLocModule />
    </div>
  );
};

export default GeoLocPage;
