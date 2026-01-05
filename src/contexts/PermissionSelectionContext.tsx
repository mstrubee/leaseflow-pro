import { createContext, useContext, useState, ReactNode } from "react";

export type PermissionLevel = "none" | "view" | "edit" | "full"; // full = ver + editar + guardar

export interface ElementPermission {
  elementId: string;
  label: string;
  permission: PermissionLevel;
}

interface PermissionSelectionState {
  isSelecting: boolean;
  selectedElements: Record<string, ElementPermission>;
  pendingUserData: {
    email: string;
    password: string;
    name: string;
    role: "admin" | "user";
  } | null;
}

interface PermissionSelectionContextType extends PermissionSelectionState {
  startSelection: (userData: PermissionSelectionState["pendingUserData"]) => void;
  setElementPermission: (elementId: string, label: string, permission: PermissionLevel) => void;
  removeElementPermission: (elementId: string) => void;
  confirmSelection: () => { 
    userData: PermissionSelectionState["pendingUserData"]; 
    permissions: Record<string, ElementPermission>;
  };
  cancelSelection: () => void;
  getElementPermission: (elementId: string) => PermissionLevel;
}

const PermissionSelectionContext = createContext<PermissionSelectionContextType | null>(null);

export const usePermissionSelection = () => {
  const context = useContext(PermissionSelectionContext);
  if (!context) {
    // Return a default object for components outside the provider
    return {
      isSelecting: false,
      selectedElements: {},
      pendingUserData: null,
      startSelection: () => {},
      setElementPermission: () => {},
      removeElementPermission: () => {},
      confirmSelection: () => ({ userData: null, permissions: {} }),
      cancelSelection: () => {},
      getElementPermission: () => "none" as PermissionLevel,
    };
  }
  return context;
};

export const PermissionSelectionProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<PermissionSelectionState>({
    isSelecting: false,
    selectedElements: {},
    pendingUserData: null,
  });

  const startSelection = (userData: PermissionSelectionState["pendingUserData"]) => {
    setState({
      isSelecting: true,
      selectedElements: {},
      pendingUserData: userData,
    });
  };

  const setElementPermission = (elementId: string, label: string, permission: PermissionLevel) => {
    setState(prev => ({
      ...prev,
      selectedElements: {
        ...prev.selectedElements,
        [elementId]: { elementId, label, permission },
      },
    }));
  };

  const removeElementPermission = (elementId: string) => {
    setState(prev => {
      const { [elementId]: _, ...rest } = prev.selectedElements;
      return { ...prev, selectedElements: rest };
    });
  };

  const confirmSelection = () => {
    const result = {
      userData: state.pendingUserData,
      permissions: state.selectedElements,
    };
    setState({
      isSelecting: false,
      selectedElements: {},
      pendingUserData: null,
    });
    return result;
  };

  const cancelSelection = () => {
    setState({
      isSelecting: false,
      selectedElements: {},
      pendingUserData: null,
    });
  };

  const getElementPermission = (elementId: string): PermissionLevel => {
    return state.selectedElements[elementId]?.permission || "none";
  };

  return (
    <PermissionSelectionContext.Provider
      value={{
        ...state,
        startSelection,
        setElementPermission,
        removeElementPermission,
        confirmSelection,
        cancelSelection,
        getElementPermission,
      }}
    >
      {children}
    </PermissionSelectionContext.Provider>
  );
};
