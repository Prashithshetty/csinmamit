import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "../ui/button";
import { GitHubLogoIcon as GithubIcon } from "@radix-ui/react-icons";
import { LinkedinIcon } from "lucide-react";

interface TeamMemberProps {
  email?: string;
  name: string;
  branch: string;
  position: string;
  linkedin?: string;
  github?: string;
  imageSrc: string;
  year: number;
  order: number;
}

export const TeamMember: React.FC<TeamMemberProps> = ({
  name,
  position,
  linkedin,
  github,
  imageSrc,
}) => {
  return (
    <div className="bg-gradient-to-br from-white via-gray-50 to-blue-50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:ring-2 hover:ring-blue-400 rounded-2xl p-6">
      <div className="flex items-center justify-center p-4">
        <div className="relative h-44 w-44 overflow-hidden rounded-full border-4 border-white shadow-md">
          <Image
            src={imageSrc}
            width={250}
            height={250}
            alt="main-image"
            quality={100}
            className="h-full w-full object-cover"
          />
        </div>
      </div>
      <div className="text-center">
        <h2 className="text-2xl font-semibold">{name}</h2>
        <p className="text-blue-500">{position}</p>
        <div className="mt-4 flex justify-center gap-4">
          {linkedin && (
            <Link
              title="LinkedIn"
              className="text-gray-500 hover:text-blue-600 transform transition-transform duration-200 hover:scale-110"
              href={linkedin}
              target="_blank"
            >
              <LinkedinIcon size={24} />
            </Link>
          )}
          {github && (
            <Link
              title="GitHub"
              className="text-gray-500 hover:text-black transform transition-transform duration-200 hover:scale-110"
              href={github}
              target="_blank"
            >
              <GithubIcon />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};
