"use client";

import { Globe, Moon, Sun, Loader2 } from "lucide-react";

type Language = "FR" | "EN" | "AR";

const LANGUAGES: { value: Language; label: string }[] = [
    { value: "FR", label: "Français" },
    { value: "EN", label: "English" },
    { value: "AR", label: "العربية" },
];