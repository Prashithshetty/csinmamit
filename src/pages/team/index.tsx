// pages/team/index.tsx

import { useEffect, useState } from "react";
import { FacultyList } from "~/lib/constants";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import MaxWidthWrapper from "~/components/layout/max-width-wrapper";
import Loader from "~/components/ui/loader";
import localFont from "next/font/local";
import { Faculty } from "~/components/team/faculty-cards";
import { Fade } from "react-awesome-reveal";
import {TeamMember}from "~/components/team/team-cards";
import { CoreMembers } from "~/components/team/team-data";

const obscuraFont = localFont({ src: "../../pages/obscura.otf" });

export default function HomePage() {
  const [loading, setLoading] = useState(true);

  // Simulate loading delay
  useEffect(() => {
    const delay = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(delay);
  }, []);

  return (
    <MaxWidthWrapper className="mb-12 mt-9 flex flex-col items-center justify-center text-center sm:mt-12">
      <Fade triggerOnce cascade>
        <div className="mb-10 mt-10">
          <h1
            className={`${obscuraFont.className} bg-gradient-to-b from-pink-600 to-violet-400 bg-clip-text pt-10 text-center text-6xl font-black text-transparent underline-offset-2`}
          >
            Meet the Team
          </h1>
          <p className="sm-text-lg mt-5 max-w-prose font-semibold text-zinc-700 underline">
            CSI NMAMIT - 2024
          </p>
        </div>

        {loading ? (
          <Loader />
        ) : (
          <Tabs defaultValue="team">
            <TabsList>
              <TabsTrigger value="fac">Faculty</TabsTrigger>
              <TabsTrigger value="team">Team</TabsTrigger>
            </TabsList>

            {/* Faculty Tab */}
            <TabsContent value="fac">
              <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-10 px-4 pb-10">
                {FacultyList.map((member, index) => (
                  <Faculty key={index} {...member} />
                ))}
              </div>
            </TabsContent>

            {/* Team Tab */}
            <TabsContent value="team">
              <div className="mt-10 flex flex-wrap justify-center gap-20 pb-10">
                {CoreMembers.sort((a, b) => a.order - b.order).map((member, index) => (
                  <TeamMember key={index} {...member} />
                ))}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </Fade>
    </MaxWidthWrapper>
  );
}
