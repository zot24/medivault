import { createContext, useContext, type ReactNode } from "react";
import { OWNED, type FileSource } from "./file-source";

const FileSourceContext = createContext<FileSource>(OWNED);

/** Wrap a subtree whose records come from a share token instead of the signed-in owner. */
export function FileSourceProvider({ source, children }: { source: FileSource; children: ReactNode }) {
  return <FileSourceContext.Provider value={source}>{children}</FileSourceContext.Provider>;
}

/** The FileSource the nearest provider set; the owner's own endpoints by default. */
export function useFileSource(): FileSource {
  return useContext(FileSourceContext);
}
