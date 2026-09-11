package com.smsbridge.app.data.remote

import android.util.Log
import okhttp3.Interceptor
import okhttp3.Response
import kotlin.time.measureTimedValue

/**
 * A deliberately minimal request logger: method, path (no query string,
 * since none of this API's endpoints use one that could carry sensitive
 * data — but this is defense in depth), HTTP status, and duration only.
 *
 * NEVER logs headers (the Authorization header carries the device bearer
 * token) or the request/response body (which can carry SMS sender/body
 * text). This exists specifically so we do NOT reach for
 * okhttp3.logging.HttpLoggingInterceptor, whose BODY/HEADERS levels would
 * violate the "never log the device token or SMS content, even at DEBUG"
 * requirement — see README.md "Security: logging".
 */
class RedactingLoggingInterceptor(private val tag: String = "SmsBridgeHttp") : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val (response, duration) = measureTimedValue { chain.proceed(request) }
        Log.d(tag, "${request.method} ${request.url.encodedPath} -> ${response.code} (${duration.inWholeMilliseconds}ms)")
        return response
    }
}
