import Image from "next/image";
import { useState } from "react";

interface FacProps {
  name: string;
  position: string;
  imageSrc: string;
  branch: string;
}

export const Faculty: React.FC<FacProps> = ({
  name,
  position,
  branch,
  imageSrc,
}) => {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      onClick={() => setFlipped(!flipped)} // Tap to flip
      className="group relative h-[340px] w-[280px] cursor-pointer [perspective:1000px]"
    >
      <div
        className={`relative h-full w-full transition-transform duration-700 [transform-style:preserve-3d] ${
          flipped ? "rotate-y-180" : "group-hover:rotate-y-180"
        } group-hover:scale-[1.03]`}
      >
        {/* FRONT */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white via-gray-50 to-blue-50 p-6 shadow-md transition-all duration-300 hover:shadow-[0_8px_30px_rgba(47,87,235,0.5)] [backface-visibility:hidden]">
          <div className="flex items-center justify-center p-4">
            <div className="relative h-36 w-36 overflow-hidden rounded-full border-4 border-white shadow-md">
              <Image
                src={imageSrc}
                width={250}
                height={250}
                alt="faculty"
                quality={100}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
          <div className="text-center mt-3">
            <h2 className="text-lg font-bold text-black">{name}</h2>
            <p className="font-semibold text-red-500">{branch}</p>
            <p className="text-blue-500">{position}</p>
          </div>
        </div>

        {/* BACK */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-100 to-white p-6 text-center shadow-md [backface-visibility:hidden] rotate-y-180 backdrop-blur-sm">
          <div className="flex flex-col justify-center items-center h-full">
            <h3 className="text-lg font-semibold text-blue-800">
              Know More Soon 👀
            </h3>
            <p className="text-sm text-gray-600 mt-2">
              Flip interaction demo more info later!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
