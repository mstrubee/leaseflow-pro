import { createContext, useContext, useState, ReactNode } from "react";

export type PermissionLevel = "none" | "view" | "edit"; // edit = ver + modificar + guardar

export interface ElementPermission {
  elementId: string;
  label: string;
  permission: PermissionLevel;
}

interface PendingUserData {
  email: string;
  password: string;
  name: string;
  role: "admin" | "user";
  userId?: string; // For editing existing users
}

interface PermissionSelectionState {
  isSelecting: boolean;
  selectedElements: Record<string, ElementPermission>;
  pendingUserData: PendingUserData | null;
  isEditMode: boolean; // true when editing existing user, false when creating new
}

interface PermissionSelectionContextType extends PermissionSelectionState {
  startSelection: (userData: PendingUserData, existingPermissions?: Record<string, ElementPermission>) => void;
  setElementPermission: (elementId: string, label: string, permission: PermissionLevel) => void;
  removeElementPermission: (elementId: string) => void;
  confirmSelection: () => { 
    userData: PendingUserData | null; 
    permissions: Record<string, ElementPermission>;
    isEditMode: boolean;
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
      isEditMode: false,
      startSelection: () => {},
      setElementPermission: () => {},
      removeElementPermission: () => {},
      confirmSelection: () => ({ userData: null, permissions: {}, isEditMode: false }),
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
    isEditMode: false,
  });

  const startSelection = (userData: PendingUserData, existingPermissions?: Record<string, ElementPermission>) => {
    setState({
      isSelecting: true,
      selectedElements: existingPermissions || {},
      pendingUserData: userData,
      isEditMode: !!userData.userId,
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
      isEditMode: state.isEditMode,
    };
    setState({
      isSelecting: false,
      selectedElements: {},
      pendingUserData: null,
      isEditMode: false,
    });
    return result;
  };

  const cancelSelection = () => {
    setState({
      isSelecting: false,
      selectedElements: {},
      pendingUserData: null,
      isEditMode: false,
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
