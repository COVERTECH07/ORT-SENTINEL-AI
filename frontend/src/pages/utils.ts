import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, ArrowDownRight, ArrowUpRight, Award, Bell, ChefHat, ChevronDown, CircleHelp,
  Clock3, Download, Flame, Leaf, LayoutDashboard, LogOut, Menu, Search, Settings2, ShieldCheck,
  Sparkles, TrendingUp, Users, Utensils, X,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import api, { getError, User, WasteEvent } from "../api";
import SentinelLogo from "../components/SentinelLogo";

type JsonRecord = Record<string, unknown>;
export const asNumber = (value: unknown) => Number(value ?? 0);
export const asArray = <T,>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];
export const itemLabel = (item: WasteEvent["food_items"][number]) => typeof item === "string" ? item : item.name;
export const humanMeal = (meal: string) => meal.charAt(0).toUpperCase() + meal.slice(1);
export const dateLabel = (value: string) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const toDateInput = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export async function downloadCsv() {
  const { data } = await api.get("/admin/export.csv", { responseType: "blob" });
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ort-waste-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
