import { gql } from 'urql'

export const ContentItemsQuery = gql`
  query LoadContentItems(
    $first: Int
    $last: Int
    $after: Cursor
    $before: Cursor
    $orderBy: [ContentItemsOrderBy!]
    $filter: ContentItemFilter
  ) {
    contentItems(
      first: $first
      last: $last
      after: $after
      before: $before
      orderBy: $orderBy
      filter: $filter
    ) {
      pageInfo {
        startCursor
        endCursor
        hasNextPage
        hasPreviousPage
      }
      totalCount
      nodes {
        pubDate
        title
        uid
        subtitle
        summary
        mediaAssets {
          nodes {
            duration
            fileUid
            licenseUid
            mediaType
            title
            uid
            file {
              contentUrl
              contentSize
              mimeType
            }
          }
        }
      }
    }
  }
`
