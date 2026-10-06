export const isLocalDevelopment = process.env.NEXT_PUBLIC_JUNCTION_RUNTIME_MODE === 'local'
export const runtimeLabel = isLocalDevelopment ? 'Local development' : 'Private staging'
