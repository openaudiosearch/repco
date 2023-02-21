//********************************************************************************************************************************************* */
// The CbaDataSourcePlugin is a class that implements the DataSourcePlugin interface,
// which allows it to be used as a plugin for the Repco data integration system.
// It provides a way to access data from the CBA WordPress API, which exposes data about
// radio stations, podcasts, categories, and tags and so on. The plugin allows you to specify the endpoint
// of the API and an optional API key in the configuration. It provides methods for fetching
// updates to the data, as well as for transforming the data into forms that can be used in Repco.

// Endpoints e.g.:
// series:
// https://cba.fro.at/wp-json/wp/v2/series?page=1&per_page=1&_embed&orderby=modified&order=asc&modified_after=2021-07-27T10:29:04
// stations:
// https://cba.fro.at/wp-json/wp/v2/station
// https://cba.fro.at/wp-json/wp/v2/station?modified_after=2010-07-27T10:29:04&per_page=1&orderby=modified&order=asc
// alernativ channel
// https://cba.fro.at/wp-json/wp/v2/channel
// channels:
// posts:
// https://cba.fro.at/wp-json/wp/v2/posts

//********************************************************************************************************************************************* */

import * as zod from 'zod'
import { form } from 'repco-prisma'
import { fetch } from 'undici'
import {
  CbaAudio,
  CbaCategory,
  CbaImage,
  CbaPost,
  CbaSeries,
  CbaStation,
  CbaTag,
} from './cba/types.js'
import {
  DataSource,
  DataSourceDefinition,
  DataSourcePlugin,
  FetchUpdatesResult,
  SourceRecordForm,
} from '../datasource.js'
import { ConceptKind, ContentGroupingVariant, EntityForm } from '../entity.js'
import { FetchOpts } from '../util/datamapping.js'
import { log } from '../datasource.js'
import { HttpError } from '../util/error.js'

// Endpoint of the Datasource
const DEFAULT_ENDPOINT = 'https://cba.fro.at/wp-json/wp/v2'

const CONTENT_TYPE_JSON = 'application/json'

export type FormsWithUid = {
  uid: string
  entities: EntityForm[]
}

const configSchema = zod.object({
  endpoint: zod.string().url().optional(),
  apiKey: zod.string().optional(),
})
type ConfigSchema = zod.infer<typeof configSchema>

/**
 * A plugin for the CbaDataSource class, which implements the DataSourcePlugin interface.
 */
export class CbaDataSourcePlugin implements DataSourcePlugin {
  /**
   * Creates an instance of the CbaDataSource class, initialized with the given configuration.
   * @param config The configuration object to use for creating the CbaDataSource instance.
   * @returns An instance of the CbaDataSource class.
   */
  createInstance(config: any) {
    const parsedConfig = configSchema.parse(config)
    return new CbaDataSource(parsedConfig)
  }

  /**
   * Returns the definition of the plugin.
   * @returns An object containing the `uid` and `name` of the plugin.
   */
  get definition() {
    return {
      uid: 'urn:repco:datasource:cba',
      name: 'CBA',
    }
  }
}

export class CbaDataSource implements DataSource {
  endpoint: string
  endpointOrigin: string
  uriPrefix: string
  apiKey?: string
  constructor(config: ConfigSchema) {
    this.endpoint = config.endpoint || DEFAULT_ENDPOINT
    this.apiKey = config.apiKey || process.env.CBA_API_KEY || undefined
    const endpointUrl = new URL(this.endpoint)
    this.endpointOrigin = endpointUrl.hostname
    this.uriPrefix = `repco:cba:${this.endpointOrigin}`
  }

  get config() {
    return { endpoint: this.endpoint, apiKey: this.apiKey }
  }

  get definition(): DataSourceDefinition {
    return {
      name: 'Cultural Broacasting Archive',
      uid: 'urn:datasource:cba:' + this.endpoint,
      pluginUid: 'urn:repco:datasource:cba',
    }
  }

  canFetchUri(uri: string): boolean {
    const parsed = this.parseUri(uri)
    return !!parsed
  }

  async fetchByUri(uri: string): Promise<SourceRecordForm[]> {
    const parsed = this.parseUri(uri)
    if (!parsed) throw new Error('Invalid URI')
    switch (parsed.type) {
      case 'post': {
        const url = this._url(`/post/${parsed.id}`)
        const post = await this._fetch<CbaPost>(url)
        this.expandAttachements(post)
        return [
          {
            body: JSON.stringify(post),
            contentType: CONTENT_TYPE_JSON,
            sourceType: 'post',
            sourceUri: url,
          },
        ]
      }
      case 'audio': {
        const url = this._url(`/media/${parsed.id}`)
        const body = await this._fetch(url)
        return [
          {
            body: JSON.stringify(body),
            contentType: CONTENT_TYPE_JSON,
            sourceType: 'audio',
            sourceUri: url,
          },
        ]
      }
      case 'image': {
        const url = this._url(`/media/${parsed.id}`)
        const body = await this._fetch(url)
        return [
          {
            body: JSON.stringify(body),
            contentType: CONTENT_TYPE_JSON,
            sourceType: 'image',
            sourceUri: url,
          },
        ]
      }
      case 'series': {
        const url = this._url(`/series/${parsed.id}`)
        const body = await this._fetch(url)
        return [
          {
            body: JSON.stringify(body),
            contentType: CONTENT_TYPE_JSON,
            sourceType: 'series',
            sourceUri: url,
          },
        ]
      }
      case 'category': {
        const url = this._url(`/categories/${parsed.id}`)
        const body = await this._fetch(url)
        return [
          {
            body: JSON.stringify(body),
            contentType: CONTENT_TYPE_JSON,
            sourceType: 'category',
            sourceUri: url,
          },
        ]
      }
      case 'tag': {
        const url = this._url(`/tags/${parsed.id}`)
        const body = await this._fetch(url)
        return [
          {
            body: JSON.stringify(body),
            contentType: CONTENT_TYPE_JSON,
            sourceType: 'tag',
            sourceUri: url,
          },
        ]
      }
      case 'station': {
        //Radiostation
        const url = this._url(`/station/${parsed.id}`)
        const body = await this._fetch(url)
        return [
          {
            body: JSON.stringify(body),
            contentType: CONTENT_TYPE_JSON,
            sourceType: 'station',
            sourceUri: url,
          },
        ]
      }
    }
    throw new Error('Unsupported CBA data type: ' + parsed.type)
  }

  /**
   * Expands the attachment links for a given post and stores the attachment media in the post object.
   *
   * @param post The post for which to expand the attachment links.
   */
  async expandAttachements(post: CbaPost) {
    post._fetchedAttachements = []
    const fetchedAttachements = await Promise.all(
      post._links['wp:attachment'].map(async (attachement) => {
        const { href } = attachement
        const medias = await this._fetch(href)
        return medias
      }),
    )
    post._fetchedAttachements = fetchedAttachements.flat()
  }

  async fetchUpdates(cursorString: string | null): Promise<FetchUpdatesResult> {
    const cursor = cursorString ? JSON.parse(cursorString) : {}
    const records = []
    {
      let postsCursor = cursor.posts
      if (!postsCursor) postsCursor = '1970-01-01T01:00:00'
      const perPage = 100
      const url = this._url(
        `/posts?page=1&per_page=${perPage}&_embed&orderby=modified&order=asc&modified_after=${postsCursor}`,
      )
      const posts = await this._fetch<CbaPost[]>(url)
      await Promise.all(posts.map((post) => this.expandAttachements(post)))

      const lastPost = posts[posts.length - 1]
      if (lastPost) cursor.posts = lastPost.modified
      records.push({
        body: JSON.stringify(posts),
        contentType: CONTENT_TYPE_JSON,
        sourceType: 'posts',
        sourceUri: url,
      })
    }
    return {
      cursor: JSON.stringify(cursor),
      records,
    }
  }

  async mapSourceRecord(record: SourceRecordForm): Promise<EntityForm[]> {
    const body = JSON.parse(record.body)

    switch (record.sourceType) {
      case 'post':
        return this._mapPost(body as CbaPost)
      case 'audio':
        return this._mapAudio(body)
      case 'image':
        return this._mapImage(body)
      case 'series':
        return this._mapSeries(body)
      case 'category':
        return this._mapCategory(body)
      case 'tag':
        return this._mapTag(body)
      case 'posts':
        return (body as CbaPost[]).map((post) => this._mapPost(post)).flat()
      case 'station':
        return this._mapStation(body)

      default:
        throw new Error('Unknown source type: ' + record.sourceType)
    }
  }

  private parseUri(uri: string) {
    if (!uri.startsWith(this.uriPrefix + ':')) return null
    uri = uri.substring(this.uriPrefix.length + 1)
    const parts = uri.split(':')
    if (parts[0] === 'e') {
      if (parts.length !== 3) return null
      return {
        kind: 'entity',
        type: parts[1],
        id: parts[2],
      }
    } else if (parts[1] === 'r') {
      if (parts.length !== 4) return null
      return {
        kind: 'revision',
        type: parts[1],
        id: parts[2],
        revisionId: parts[3],
      }
    } else {
      return null
    }
  }

  private _uri(type: string, id: string | number): string {
    return `${this.uriPrefix}:e:${type}:${id}`
  }

  private _revisionUri(
    type: string,
    id: string | number,
    revisionId: string | number,
  ): string {
    return `${this.uriPrefix}:r:${type}:${id}:${revisionId}`
  }

  private _mapAudio(media: CbaAudio): EntityForm[] {
    const fileId = this._uri('file', media.id)
    const audioId = this._uri('audio', media.id)

    const file: form.FileInput = {
      contentUrl: media.source_url,
      bitrate: media.media_details.bitrate
        ? Math.round(media.media_details.bitrate)
        : undefined,
      codec: media.media_details.codec,
      duration: media.media_details.length,
      mimeType: media.mime_type,
      cid: null,
      resolution: null,
    }
    const asset: form.MediaAssetInput = {
      title: media.title.rendered,
      description: media.description?.rendered,
      mediaType: 'audio',
      duration: media.media_details.length || null,
      //License: null,
      //contributor
      Concepts: media.media_tag.map((cbaId) => ({
        uri: this._uri('tag', cbaId),
      })),
      File: { uri: fileId },
    }
    const fileEntity: EntityForm = {
      type: 'File',
      content: file,
      entityUris: [fileId],
    }
    const mediaEntity: EntityForm = {
      type: 'MediaAsset',
      content: asset,
      entityUris: [audioId],
    }
    return [fileEntity, mediaEntity]
  }

  private _mapImage(media: CbaImage): EntityForm[] {
    const fileId = this._uri('file', media.id)
    const imageId = this._uri('image', media.id)

    const file: form.FileInput = {
      contentUrl: media.source_url,
      contentSize: media.media_details.filesize || null,
      mimeType: media.mime_type,
      resolution: null,
    }
    if (media.media_details.width && media.media_details.height) {
      file.resolution =
        media.media_details.height.toString() +
        'x' +
        media.media_details.width.toString()
    }
    const asset: form.MediaAssetInput = {
      title: media.title.rendered,
      description: media.description?.rendered || null,
      mediaType: 'image',
      //License: null,
      //contributor
      Concepts: media.media_tag.map((cbaId) => ({
        uri: this._uri('tag', cbaId),
      })),
      File: { uri: fileId },
    }
    const fileEntity: EntityForm = {
      type: 'File',
      content: file,
      entityUris: [fileId],
    }
    const mediaEntity: EntityForm = {
      type: 'MediaAsset',
      content: asset,
      entityUris: [imageId],
    }
    return [fileEntity, mediaEntity]
  }

  private _mapCategory(category: CbaCategory): EntityForm[] {
    const content: form.ConceptInput = {
      name: category.name,
      description: category.description,
      kind: ConceptKind.CATEGORY,
      originNamespace: 'https://cba.fro.at/wp-json/wp/v2/categories',
    }
    if (category.parent) {
      content.ParentConcept = { uri: this._uri('category', category.parent) }
    }
    const revisionId = this._revisionUri(
      'category',
      category.id,
      new Date().getTime(),
    )
    const uri = this._uri('category', category.id)
    const headers = {
      revisionUris: [revisionId],
      entityUris: [uri],
    }
    return [{ type: 'Concept', content, ...headers }]
  }

  private _mapTag(tag: CbaTag): EntityForm[] {
    const content: form.ConceptInput = {
      name: tag.name,
      description: tag.description,
      kind: ConceptKind.TAG,
      originNamespace: 'https://cba.fro.at/wp-json/wp/v2/tags',
    }
    const revisionId = this._revisionUri('tag', tag.id, new Date().getTime())
    const uri = this._uri('tag', tag.id)
    const headers = {
      revisionUris: [revisionId],
      entityUris: [uri],
    }
    return [{ type: 'Concept', content, ...headers }]
  }

  private _mapStation(station: CbaStation): EntityForm[] {
    const content: form.PublicationServiceInput = {
      medium: station.type,
      address: station.link,
      name: station.title.rendered,
    }
    const revisionId = this._revisionUri(
      'station',
      station.id,
      new Date(station.modified).getTime(),
    )
    const uri = this._uri('station', station.id)
    const headers = {
      revisionUris: [revisionId],
      entityUris: [uri],
    }
    return [{ type: 'PublicationService', content, ...headers }]
  }

  private _mapSeries(series: CbaSeries): EntityForm[] {
    const content: form.ContentGroupingInput = {
      title: series.title.rendered,
      description: series.content.rendered,
      groupingType: 'show',
      subtitle: null,
      summary: null,
      broadcastSchedule: null,
      startingDate: null,
      terminationDate: null,
      variant: ContentGroupingVariant.EPISODIC,
    }
    const revisionId = this._revisionUri(
      'series',
      series.id,
      new Date(series.modified).getTime(),
    )
    const uri = this._uri('series', series.id)
    const headers = {
      revisionUris: [revisionId],
      entityUris: [uri],
    }
    return [{ type: 'ContentGrouping', content, ...headers }]
  }

  private _mapPost(post: CbaPost): EntityForm[] {
    const mediaAssetsAndFiles = post._fetchedAttachements
      .map((attachement) => this._mapAudio(attachement))
      .flat()

    const mediaAssetUris = mediaAssetsAndFiles
      .filter((entity) => entity.type === 'MediaAsset')
      .map((x) => x.entityUris || [])
      .flat()

    const mappedMediaAssets = mediaAssetUris.map((uri) => ({ uri }))
    mediaAssetUris.forEach((e) => this.fetchByUri(e))

    const featured_image = { uri: this._uri('image', post.featured_image) }
    mappedMediaAssets.push(featured_image)

    const categories = post.categories.map((cbaId) => ({
      uri: this._uri('category', cbaId),
    }))
    const tags = post.tags.map((cbaId) => ({
      uri: this._uri('tag', cbaId),
    }))
    const conceptsUris = categories.concat(tags)

    const content: form.ContentItemInput = {
      pubDate: new Date(post.date),
      content: post.content.rendered,
      contentFormat: 'text/html',
      title: post.title.rendered,
      subtitle: 'missing',
      summary: post.excerpt.rendered,
      PublicationService: { uri: this._uri('station', post.meta.station_id) },
      Concepts: conceptsUris,
      MediaAssets: mappedMediaAssets,
      PrimaryGrouping: { uri: this._uri('series', post.post_parent) },
      //licenseUid
      //primaryGroupingUid
      //contributor
      //AdditionalGroupings
      //License
      //BroadcastEvents
    }
    const revisionId = this._revisionUri(
      'post',
      post.id,
      new Date(post.modified).getTime(),
    )
    const entityUri = this._uri('post', post.id)

    const headers = {
      revisionUris: [revisionId],
      entityUris: [entityUri],
    }
    return [
      ...mediaAssetsAndFiles,
      { type: 'ContentItem', content, ...headers },
    ]
  }

  private _url(urlString: string, opts: FetchOpts = {}) {
    const url = new URL(this.endpoint + urlString)
    if (opts.params) {
      for (const [key, value] of Object.entries(opts.params)) {
        url.searchParams.set(key, value)
      }
      opts.params = undefined
    }
    return url.toString()
  }

  private async _fetch<T = any>(
    urlString: string,
    opts: FetchOpts = {},
  ): Promise<T> {
    const url = new URL(urlString)
    if (this.apiKey) {
      url.searchParams.set('api_key', this.apiKey)
    }
    try {
      const res = await fetch(url.toString(), opts)
      log.debug(`fetch (${res.status}, url: ${url})`)
      if (!res.ok) {
        throw await HttpError.fromResponseJson(res, url)
      }
      const json = await res.json()
      return json as T
    } catch (err) {
      log.debug(`fetch failed (url: ${url}, error: ${err})`)
      throw err
    }
  }
}
