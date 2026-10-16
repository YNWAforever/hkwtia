import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import {useState} from "react";
import {MediaPicker} from "@/components/admin/media-picker";
import { EventForm } from "@/components/admin/event-form";
import { AdminUnsavedChangesProvider } from "@/components/admin/unsaved-changes-guard";
it("finds one registered image among 79 while retaining the selected image and forbidding raw URL input", () => {
  const mediaRows = Array.from({ length: 79 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    altEn: `Synthetic logo ${i}`,
    altZh: `合成標誌 ${i}`,
    url: `/archive/synthetic-${i}.webp`,
    contentType: "image/webp",
  }));
  const labels = {
    ...en.Admin.eventsMgmt,
    mediaSearch: "Search registry",
    mediaResult: "Registered images",
    mediaSelected: "Selected image",
  };
  render(
    <AdminUnsavedChangesProvider confirmMessage="Leave?">
      <EventForm
        action={vi.fn(async () => ({}))}
        labels={labels}
        mediaRows={mediaRows}
        values={{ heroMediaId: mediaRows[0]!.id }}
      />
    </AdminUnsavedChangesProvider>,
  );
  fireEvent.change(screen.getByRole("searchbox", { name: "Search registry" }), {
    target: { value: "logo 39" },
  });
  const select = screen.getByRole("combobox", { name: labels.heroMediaId });
  expect(within(select).getAllByRole("option")).toHaveLength(3);
  expect(select).toHaveValue(mediaRows[0]!.id);
  fireEvent.change(select, { target: { value: mediaRows[39]!.id } });
  expect(select).toHaveValue(mediaRows[39]!.id);
  expect(
    screen.getByRole("img", { name: mediaRows[39]!.altEn }),
  ).toBeInTheDocument();
  expect(document.querySelector('input[name="heroUrl"]')).toBeNull();
  expect(document.querySelector('input[name="heroMediaId"]')).toBeNull();
});

it("retains the actual registered media selection after a successful form action", async () => {
  const row = {
    id: "00000000-0000-4000-8000-000000000039",
    altEn: "Synthetic retained",
    altZh: "合成已選",
    url: "/archive/synthetic-39.webp",
  };
  const labels = {
    ...en.Admin.eventsMgmt,
    mediaSearch: "Search registry",
    mediaResult: "Registered images",
    mediaSelected: "Selected image",
  };
  render(
    <AdminUnsavedChangesProvider confirmMessage="Leave?">
      <EventForm
        action={vi.fn(async () => ({
          status: "success" as const,
          message: "Synthetic saved",
        }))}
        labels={labels}
        mediaRows={[row]}
        values={{ heroMediaId: row.id }}
      />
    </AdminUnsavedChangesProvider>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: labels.saveDraft }),
  );
  await waitFor(() =>
    expect(screen.getByText("Synthetic saved")).toBeVisible(),
  );
  expect(
    screen.getByRole("combobox", { name: labels.heroMediaId }),
  ).toHaveValue(row.id);
});

it("retains native input selection until change when the parent rerenders with registry rows", () => {
  const row={id:"00000000-0000-4000-8000-000000000040",altEn:"Synthetic native",altZh:"合成鍵盤",url:"/archive/synthetic-40.webp"};
  const changes: FormDataEntryValue[]=[];
  function Parent(){
    const [,setInputCount]=useState(0);
    return <form onInput={()=>setInputCount(n=>n+1)} onChange={event=>changes.push(new FormData(event.currentTarget).get("heroMediaId")!)}>
      <MediaPicker rows={[row]} value="" name="heroMediaId" labels={{choose:"Registered hero",none:"None",search:"Search registry",results:"Results",selected:"Selected"}}/>
    </form>;
  }
  render(<Parent/>);
  const select=screen.getByRole("combobox",{name:"Registered hero"}) as HTMLSelectElement;
  // Browsers dispatch input before change for native keyboard selection.
  // A parent input rerender used to restore the old controlled value in between.
  select.value=row.id;
  fireEvent.input(select);
  fireEvent.change(select);
  expect(select).toHaveValue(row.id);
  expect(changes).toEqual([row.id]);
});
