import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { defaultOrientationFor, type FormFactor, type Orientation } from './types';

interface FormFactorContextValue {
  formFactor: FormFactor;
  orientation: Orientation;
  setFormFactor: (next: FormFactor) => void;
  setOrientation: (next: Orientation) => void;
  toggleOrientation: () => void;
}

const FormFactorContext = createContext<FormFactorContextValue | null>(null);

function readFormFactorFromUrl(): FormFactor {
  if (typeof window === 'undefined') return 'desktop';
  const param = new URLSearchParams(window.location.search).get('form');
  if (param === 'tablet' || param === 'phone') return param;
  return 'desktop';
}

function readOrientationFromUrl(fallback: Orientation): Orientation {
  if (typeof window === 'undefined') return fallback;
  const param = new URLSearchParams(window.location.search).get('orient');
  if (param === 'portrait' || param === 'landscape') return param;
  return fallback;
}

function writeToUrl(formFactor: FormFactor, orientation: Orientation) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);

  if (formFactor === 'desktop') {
    params.delete('form');
  } else {
    params.set('form', formFactor);
  }

  // Only encode orientation if it differs from the form factor's default —
  // keeps shareable URLs short for the common case.
  if (formFactor === 'desktop' || orientation === defaultOrientationFor(formFactor)) {
    params.delete('orient');
  } else {
    params.set('orient', orientation);
  }

  const query = params.toString();
  const url = window.location.pathname + (query ? `?${query}` : '') + window.location.hash;
  window.history.replaceState({}, '', url);
}

export function FormFactorProvider({ children }: { children: React.ReactNode }) {
  const [formFactor, setFormFactorState] = useState<FormFactor>(() => readFormFactorFromUrl());
  const [orientation, setOrientationState] = useState<Orientation>(() => {
    const ff = readFormFactorFromUrl();
    return readOrientationFromUrl(defaultOrientationFor(ff));
  });

  const setFormFactor = useCallback((next: FormFactor) => {
    const nextOrientation = defaultOrientationFor(next);
    setFormFactorState(next);
    setOrientationState(nextOrientation);
    writeToUrl(next, nextOrientation);
  }, []);

  const setOrientation = useCallback((next: Orientation) => {
    setOrientationState(next);
    setFormFactorState((ff) => {
      writeToUrl(ff, next);
      return ff;
    });
  }, []);

  const toggleOrientation = useCallback(() => {
    setOrientation(orientation === 'portrait' ? 'landscape' : 'portrait');
  }, [orientation, setOrientation]);

  useEffect(() => {
    const onPopState = () => {
      const ff = readFormFactorFromUrl();
      setFormFactorState(ff);
      setOrientationState(readOrientationFromUrl(defaultOrientationFor(ff)));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const value = useMemo(
    () => ({ formFactor, orientation, setFormFactor, setOrientation, toggleOrientation }),
    [formFactor, orientation, setFormFactor, setOrientation, toggleOrientation],
  );

  return <FormFactorContext.Provider value={value}>{children}</FormFactorContext.Provider>;
}

export function useFormFactor(): FormFactorContextValue {
  const ctx = useContext(FormFactorContext);
  if (!ctx) {
    throw new Error('useFormFactor must be used within a FormFactorProvider');
  }
  return ctx;
}
