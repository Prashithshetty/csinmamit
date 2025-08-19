import { Button } from "../ui/button";
import { DoorOpen } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "~/lib/firebase-auth";

export default function AuthButton() {
  const { user, signInWithGoogle } = useAuth();

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Sign-in error:", error);
    }
  };


  // --- Logged In ---
  if (user) {
    return (
      <div className="flex items-center gap-2">
        {/* User Profile Link - Clicking this goes directly to profile */}
        <Link 
          href="/profile" 
          className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <Image
            src={user.image ?? "/favicon.ico"}
            alt="User"
            width={32}
            height={32}
            className="rounded-full object-cover h-8 w-8"
          />
          <span className="text-sm font-medium text-black dark:text-white">
            {user.name ?? "User"}
          </span>
        </Link>

        {/* Dropdown Menu for additional options - COMMENTED OUT */}
        {/* <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-zinc-800"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="w-60 bg-white dark:bg-zinc-900 text-black dark:text-white border border-gray-200 dark:border-zinc-700"
          >
            <div className="px-3 py-2">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                {user.email}
              </p>
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem asChild>
              <Link href="/profile" className="w-full">
                Your Profile
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link href="/" className="w-full">
                Dashboard
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem className="p-0">
              <Button
                variant="destructive"
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 text-sm"
              >
                Sign Out
                <DoorClosed className="h-4 w-4" />
              </Button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu> */}
      </div>
    );
  }

  // --- Not Logged In ---
  return (
    <Button onClick={handleSignIn} className="gap-2 text-sm">
      Log In
      <DoorOpen className="h-4 w-4" />
    </Button>
  );
}
