"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MessageCircle,
  Blocks,
  Plus,
  Clock,
  User,
  LogOut,
  ChevronRight,
  Sparkles,
  GitBranch,
  Zap,
  LayoutDashboard,
  Eye,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useConversations, useCanvases } from "@/hooks/useConversation";
import { toast } from "sonner";

type Project = {
  id: string;
  name: string;
  type: "conversation" | "builder";
  lastAccessed: string;
  nodeCount: number;
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading, signOut } = useAuth();
  const { conversations, isLoading: isConversationsLoading, reload } = useConversations();
  const { canvases, isLoading: isCanvasesLoading } = useCanvases();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push("/login");
    }
  }, [user, isAuthLoading, router]);

  // Seed sample data for new users
  const seedSampleData = useCallback(async () => {
    if (isSeeding) return;
    setIsSeeding(true);
    try {
      const response = await fetch("/api/seed", { method: "POST" });
      const data = await response.json();
      if (data.seeded) {
        toast.success("Sample conversation created!", {
          description: "Check it out to see how the conversation graph works.",
        });
        // Refresh conversations
        reload?.();
      }
    } catch (error) {
      console.error("Failed to seed data:", error);
    } finally {
      setIsSeeding(false);
    }
  }, [isSeeding, reload]);

  // Check if this is first visit (for onboarding)
  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem("hasSeenOnboarding");
    if (!hasSeenOnboarding && user) {
      setShowOnboarding(true);
      // Seed sample data for new users
      seedSampleData();
    }
  }, [user, seedSampleData]);

  const dismissOnboarding = () => {
    localStorage.setItem("hasSeenOnboarding", "true");
    setShowOnboarding(false);
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-gray-300 border-t-gray-600 rounded-full" />
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  const userInitials = user.email?.slice(0, 2).toUpperCase() || "U";

  // Convert conversations to project format
  const conversationProjects: Project[] = conversations.map((conv) => ({
    id: conv.id,
    name: conv.name,
    type: "conversation" as const,
    lastAccessed: conv.updated_at || conv.created_at,
    nodeCount: 0,
  }));

  // Convert canvases to project format
  const canvasProjects: Project[] = canvases.map((canvas) => ({
    id: canvas.id,
    name: canvas.name,
    type: "builder" as const,
    lastAccessed: canvas.updated_at || canvas.created_at,
    nodeCount: 0,
  }));

  // Merge and sort by last accessed
  const recentProjects: Project[] = [...conversationProjects, ...canvasProjects]
    .sort((a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime())
    .slice(0, 10);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Onboarding Overlay */}
      {showOnboarding && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="max-w-lg w-full animate-in fade-in zoom-in duration-300">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center mb-4">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl">Welcome to Nested! 🎉</CardTitle>
              <CardDescription className="text-base mt-2">
                A new way to interact with AI through visual canvases and structured context.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                  <MessageCircle className="h-6 w-6 text-blue-500 mb-2" />
                  <h4 className="font-medium text-sm">Conversation Graph</h4>
                  <p className="text-xs text-gray-500">
                    Branch conversations visually
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                  <Blocks className="h-6 w-6 text-purple-500 mb-2" />
                  <h4 className="font-medium text-sm">MVP Builder</h4>
                  <p className="text-xs text-gray-500">
                    Plan and build with AI
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                  <Eye className="h-6 w-6 text-emerald-500 mb-2" />
                  <h4 className="font-medium text-sm">Context Lens</h4>
                  <p className="text-xs text-gray-500">
                    See what the AI sees
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                  <GitBranch className="h-6 w-6 text-amber-500 mb-2" />
                  <h4 className="font-medium text-sm">Explicit Branching</h4>
                  <p className="text-xs text-gray-500">
                    Control context precisely
                  </p>
                </div>
              </div>
              <Button onClick={dismissOnboarding} className="w-full">
                Get Started
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-xl text-gray-900">Nested</span>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-gray-200 text-gray-600 text-sm">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline text-sm text-gray-700">
                    {user.email}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <User className="h-4 w-4 mr-2" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="text-red-600">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Good {getTimeOfDay()}, {user.email?.split("@")[0]}!
          </h1>
          <p className="text-gray-600">
            What would you like to create today?
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-2 gap-6 mb-10">
          <Link href="/flow">
            <Card className="group cursor-pointer hover:shadow-lg transition-all border-2 hover:border-blue-200">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <MessageCircle className="h-6 w-6 text-blue-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      Conversation Graph
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Chat with AI through visual, branching conversations.
                      Control exactly what context the agent sees.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">Branching</Badge>
                      <Badge variant="secondary">Context Control</Badge>
                      <Badge variant="secondary">Visual</Badge>
                    </div>
                  </div>
                  <ChevronRight className="h-6 w-6 text-gray-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/builder">
            <Card className="group cursor-pointer hover:shadow-lg transition-all border-2 hover:border-purple-200">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Blocks className="h-6 w-6 text-purple-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      MVP Builder
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Plan your app visually, then let AI build it.
                      Import from whiteboards or start from scratch.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">No-Code</Badge>
                      <Badge variant="secondary">Whiteboard Import</Badge>
                      <Badge variant="secondary">AI Build</Badge>
                    </div>
                  </div>
                  <ChevronRight className="h-6 w-6 text-gray-400 group-hover:text-purple-500 group-hover:translate-x-1 transition-all" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Recent Projects */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Recent Projects
            </h2>
            <div className="flex gap-2">
              <Link href="/builder">
                <Button variant="outline" size="sm" className="gap-2">
                  <Blocks className="h-4 w-4" />
                  New Canvas
                </Button>
              </Link>
              <Link href="/flow">
                <Button variant="outline" size="sm" className="gap-2">
                  <MessageCircle className="h-4 w-4" />
                  New Conversation
                </Button>
              </Link>
            </div>
          </div>

          {(isConversationsLoading || isCanvasesLoading) ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : recentProjects.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Sparkles className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-4">No projects yet</p>
                <div className="flex justify-center gap-2">
                  <Link href="/flow">
                    <Button>Start a Conversation</Button>
                  </Link>
                  <Link href="/builder">
                    <Button variant="outline">Create a Canvas</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {recentProjects.map((project) => (
                <Link key={`${project.type}-${project.id}`} href={project.type === "builder" ? `/builder?id=${project.id}` : `/flow?id=${project.id}`}>
                  <Card className="hover:bg-gray-50 transition-colors cursor-pointer">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${project.type === "builder" ? "bg-purple-100" : "bg-blue-100"}`}>
                            {project.type === "builder" ? (
                              <Blocks className="h-5 w-5 text-purple-600" />
                            ) : (
                              <MessageCircle className="h-5 w-5 text-blue-600" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-gray-900">
                                {project.name}
                              </h4>
                              <Badge variant="secondary" className="text-xs">
                                {project.type === "builder" ? "Canvas" : "Chat"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <Clock className="h-3 w-3" />
                              {formatRelativeTime(project.lastAccessed)}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Feature Highlights */}
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200">
            <CardContent className="p-5">
              <Eye className="h-8 w-8 text-blue-600 mb-3" />
              <h4 className="font-semibold text-gray-900 mb-1">Context Lens</h4>
              <p className="text-sm text-gray-600">
                See exactly what the AI sees. Toggle nodes in/out of context with full transparency.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 border-purple-200">
            <CardContent className="p-5">
              <GitBranch className="h-8 w-8 text-purple-600 mb-3" />
              <h4 className="font-semibold text-gray-900 mb-1">Smart Branching</h4>
              <p className="text-sm text-gray-600">
                Explore multiple conversation paths. Reference other branches with @mentions.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-200">
            <CardContent className="p-5">
              <Zap className="h-8 w-8 text-emerald-600 mb-3" />
              <h4 className="font-semibold text-gray-900 mb-1">Cost Control</h4>
              <p className="text-sm text-gray-600">
                Smart routing uses smaller models first, escalating only when needed.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
