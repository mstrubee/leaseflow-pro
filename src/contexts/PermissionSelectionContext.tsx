import { createContext, useContext, useState, ReactNode } from "react";

interface PermissionSelectionState {
  isSelecting: boolean;
  selectedSections: Record<string, "view" | "edit" | "all" | "none">;
  pendingUserData: {
    email: string;
    password: string;
    name: string;
    role: "admin" | "user";
  } | null;
}

interface PermissionSelectionContextType extends PermissionSelectionState {
  startSelection: (userData: PermissionSelectionState["pendingUserData"]) => void;
  toggleSection: (sectionId: string, permission: "view" | "edit" | "all" | "none") => void;
  confirmSelection: () => { userData: PermissionSelectionState["pendingUserData"]; permissions: Record<string, "view" | "edit" | "all" | "none"> };
  cancelSelection: () => void;
}

const PermissionSelectionContext = createContext<PermissionSelectionContextType | null>(null);

export const usePermissionSelection = () => {
  const context = useContext(PermissionSelectionContext);
  if (!context) {
    throw new Error("usePermissionSelection must be used within a PermissionSelectionProvider");
  }
  return context;
};

export const PermissionSelectionProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<PermissionSelectionState>({
    isSelecting: false,
    selectedSections: {},
    pendingUserData: null,
  });

  const startSelection = (userData: PermissionSelectionState["pendingUserData"]) => {
    setState({
      isSelecting: true,
      selectedSections: {},
      pendingUserData: userData,
    });
  };

  const toggleSection = (sectionId: string, permission: "view" | "edit" | "all" | "none") => {
    setState(prev => ({
      ...prev,
      selectedSections: {
        ...prev.selectedSections,
        [sectionId]: permission,
      },
    }));
  };

  const confirmSelection = () => {
    const result = {
      userData: state.pendingUserData,
      permissions: state.selectedSections,
    };
    setState({
      isSelecting: false,
      selectedSections: {},
      pendingUserData: null,
    });
    return result;
  };

  const cancelSelection = () => {
    setState({
      isSelecting: false,
      selectedSections: {},
      pendingUserData: null,
    });
  };

  return (
    <PermissionSelectionContext.Provider
      value={{
        ...state,
        startSelection,
        toggleSection,
        confirmSelection,
        cancelSelection,
      }}
    >
      {children}
    </PermissionSelectionContext.Provider>
  );
};
