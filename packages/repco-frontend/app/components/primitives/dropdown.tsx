import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { HamburgerMenuIcon } from '@radix-ui/react-icons'
import { Form, NavLink } from '@remix-run/react'
import { Button } from '../primitives/button'

type Props = {
  node: string
}

export function DropdownMenuCards(props: Props) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Button>
          <HamburgerMenuIcon />
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className="bg-white" align="end" sideOffset={5}>
          <Form method="post" action="/playlists/add">
            <Button name="add-item" type="submit" value={props.node}>
              add to playlist
            </Button>
          </Form>

          <DropdownMenu.Item
            disabled={true}
            className="block text-sm py-2 px-4 text-gray-400 hover:bg-gray-100 pointer-events-none cursor-not-allowed"
          >
            Transcription
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={true}
            className="block text-sm py-2 px-4 text-gray-400 hover:bg-gray-100 pointer-events-none cursor-not-allowed"
          >
            Translation
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={true}
            className="block text-sm py-2 px-4 text-gray-400 hover:bg-gray-100 pointer-events-none cursor-not-allowed"
          >
            get similar items
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={true}
            className="block text-sm py-2 px-4 text-gray-400 hover:bg-gray-100 pointer-events-none cursor-not-allowed"
          >
            <NavLink to="#">recommend/share</NavLink>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
