import * as React from "react";

export function useMaxWidth(maxWidth: number): boolean {
  const [isMatch, setIsMatch] = React.useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia(`(max-width: ${maxWidth}px)`).matches;
    }
    return false;
  });

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const onChange = () => setIsMatch(mediaQuery.matches);

    onChange();
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, [maxWidth]);

  return isMatch;
}
