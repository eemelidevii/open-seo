import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";

export default function OpenSeoDevtools() {
  return (
    <TanStackDevtools
      config={{ position: "bottom-right" }}
      eventBusConfig={{ connectToServerBus: true }}
      plugins={[
        {
          name: "TanStack Router",
          render: <TanStackRouterDevtoolsPanel />,
          defaultOpen: true,
        },
      ]}
    />
  );
}
