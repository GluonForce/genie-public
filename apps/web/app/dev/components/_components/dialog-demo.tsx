"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export function DialogDemo() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" className="self-start" onClick={() => setOpen(true)}>
        Open dialog
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} aria-labelledby="demo-dialog-title">
        <div className="flex flex-col gap-5">
          <h2 id="demo-dialog-title" className="font-display text-[28px] leading-tight font-extrabold">
            Decline and stop here?
          </h2>
          <p>This cannot be undone. Your one free prototype is used up.</p>
          <div className="flex flex-wrap gap-3">
            <Button size="sm" className="flex-[1_1_220px]" onClick={() => setOpen(false)}>
              Go back to the requirements
            </Button>
            <Button
              variant="danger"
              size="sm"
              className="flex-[1_1_220px]"
              onClick={() => setOpen(false)}
            >
              Decline and use my free prototype
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
