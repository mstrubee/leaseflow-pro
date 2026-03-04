import { PatentsModule } from "@/components/patents/PatentsModule";
import { SelectableElement } from "@/components/admin/SelectableElement";

const PatentsDashboard = () => {
  return (
    <div className="space-y-6 pl-14">
      <SelectableElement elementId="patents" label="Patentes">
        <PatentsModule />
      </SelectableElement>
    </div>
  );
};

export default PatentsDashboard;
