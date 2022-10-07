import stylesUrl from '~/styles/routes.css'
import type { LinksFunction } from '@remix-run/node'
import { json, LoaderFunction } from '@remix-run/node'
import {
  Link,
  NavLink,
  Outlet,
  useFetcher,
  useLoaderData,
} from '@remix-run/react'
import { useCallback, useEffect, useState } from 'react'
import { gql } from 'urql'
import { SanitizedHTML } from '~/components/sanitized-html'
import type {
  LoadContentItemsQuery,
  LoadContentItemsQueryVariables,
} from '~/graphql/types.js'
import { graphqlQuery } from '~/lib/graphql.server'

export const links: LinksFunction = () => {
  return [{ rel: 'stylesheet', href: stylesUrl }]
}
const QUERY = gql`
  query LoadContentItems(
    $first: Int
    $last: Int
    $after: Cursor
    $before: Cursor
  ) {
    contentItems(first: $first, last: $last, after: $after, before: $before) {
      pageInfo {
        startCursor
        endCursor
        hasNextPage
        hasPreviousPage
      }
      totalCount
      nodes {
        title
        uid
        summary
      }
    }
  }
`

const getPage = (searchParams: URLSearchParams) => ({
  after: searchParams.get('page'),
})

type LoaderData = { data: LoadContentItemsQuery }

export const loader: LoaderFunction = async ({ request }) => {
  const courser = getPage(new URL(request.url).searchParams)
  const data = await graphqlQuery<
    LoadContentItemsQuery,
    LoadContentItemsQueryVariables
  >(QUERY, {
    first: 10,
    last: null,
    after: courser.after,
    before: null,
  })
  return json({ contentItems: data.data?.contentItems })
}
//TODO: TYPING, Scroll behavior, Pagination
export default function Items() {
  const { contentItems } = useLoaderData()
  const [pageInfo, setPageInfo] = useState(contentItems.pageInfo)
  const [nodes, setNodes] = useState(contentItems.nodes)
  const fetcher = useFetcher()

  const [scrollPosition, setScrollPosition] = useState(0)
  const [clientHeight, setClientHeight] = useState(0)
  const [height, setHeight] = useState(null)

  const [shouldFetch, setShouldFetch] = useState(true)
  const [page, setPage] = useState('')

  // Set the height of the parent container whenever photos are loaded
  const divHeight = useCallback(
    (node: any) => {
      if (node !== null) {
        setHeight(node.getBoundingClientRect().height)
      }
    },
    [nodes.length],
  )

  // Add Listeners to scroll and client resize
  useEffect(() => {
    const scrollListener = () => {
      setClientHeight(window.innerHeight)
      setScrollPosition(window.scrollY)
    }

    // Avoid running during SSR
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', scrollListener)
    }

    // Clean up
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('scroll', scrollListener)
      }
    }
  }, [])

  // Listen on scrolls. Fire on some self-described breakpoint
  useEffect(() => {
    if (!shouldFetch || !height) return
    if (clientHeight + scrollPosition < height) return
    fetcher.load(`/items?page=${pageInfo.endCursor}`)
    setShouldFetch(false)
  }, [clientHeight, scrollPosition, fetcher])

  // Merge nodes, increment page, and allow fetching again
  useEffect(() => {
    // Discontinue API calls if the last page has been reached
    if (fetcher.data && fetcher.data.length === 0) {
      setShouldFetch(false)
      return
    }

    // Nodes contain data, merge them and allow the possiblity of another fetch
    if (fetcher.data) {
      console.log(fetcher.data)
      setNodes((prevNodes: any) => [
        ...prevNodes,
        ...fetcher.data.contentItems.nodes,
      ])
      setPageInfo(fetcher.data.contentItems.pageInfo)
      setPage(pageInfo.endCursor)
      if (pageInfo.hasNextPage) {
        setShouldFetch(true)
      }
    }
  }, [fetcher.data])
  return (
    <div>
      <div>
        <Link to="/">Home</Link>
      </div>
      <div className="container">
        <div className="fixed" ref={divHeight}>
          <table className="table">
            <tr>
              <th>Nr</th>
              <th>UID</th>
              <th>Title</th>
              <th>Summary</th>
            </tr>
            {nodes.map((node: any, index: any) => {
              return (
                <tr
                  key={node.uid}
                  //TODO: my a better UX
                  //onClick={() => {window.open(`/item/${node.uid}`)}}
                >
                  <td>{index + 1}</td>
                  <td>
                    <NavLink prefetch="render" to={`/items/item/${node.uid}`}>
                      {node.uid}
                    </NavLink>
                  </td>
                  <td>{node.title}</td>
                  <td>
                    <SanitizedHTML
                      allowedTags={['a', 'p']}
                      html={node.summary}
                    />
                  </td>
                </tr>
              )
            })}
          </table>
        </div>
        <div className="flex-item">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
