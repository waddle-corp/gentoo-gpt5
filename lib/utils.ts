export function cn(...classes: Array<string | undefined | null | false | Record<string, boolean>>): string {
    const resolved: string[] = [];
  
    for (const cls of classes) {
      if (!cls) continue;
  
      if (typeof cls === "string") {
        if (cls.trim().length > 0) resolved.push(cls);
        continue;
      }
  
      if (typeof cls === "object") {
        for (const [key, value] of Object.entries(cls)) {
          if (value) resolved.push(key);
        }
      }
    }
  
    return resolved.join(" ");
  } 
  