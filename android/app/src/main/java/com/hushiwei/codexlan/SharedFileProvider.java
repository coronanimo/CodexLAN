package com.hushiwei.codexlan;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.List;

public final class SharedFileProvider extends ContentProvider {
    private static final String PDF_DIRECTORY = "shared-pdf";
    private static final String MARKDOWN_DIRECTORY = "shared-markdown";

    public static Uri uriForFile(Context context, File file) {
        return new Uri.Builder()
            .scheme("content")
            .authority(context.getPackageName() + ".file-share")
            .appendPath(file.getParentFile().getName())
            .appendPath(file.getName())
            .build();
    }

    @Override public boolean onCreate() { return true; }

    @Override
    public String getType(Uri uri) {
        String name = uri.getLastPathSegment();
        return name != null && name.toLowerCase().endsWith(".md") ? "text/markdown" : "application/pdf";
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        String[] columns = projection == null ? new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE } : projection;
        File file;
        try {
            file = resolve(uri);
        } catch (FileNotFoundException error) {
            return new MatrixCursor(columns, 0);
        }
        MatrixCursor cursor = new MatrixCursor(columns, 1);
        MatrixCursor.RowBuilder row = cursor.newRow();
        for (String column : columns) {
            if (OpenableColumns.DISPLAY_NAME.equals(column)) row.add(file.getName());
            else if (OpenableColumns.SIZE.equals(column)) row.add(file.length());
            else row.add(null);
        }
        return cursor;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("Shared files are read-only");
        File file = resolve(uri);
        if (!file.isFile()) throw new FileNotFoundException("Shared file no longer exists");
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    private File resolve(Uri uri) throws FileNotFoundException {
        Context context = getContext();
        List<String> segments = uri.getPathSegments();
        if (context == null || segments.size() != 2) throw new FileNotFoundException("Invalid shared file");
        String directoryName = segments.get(0);
        String fileName = segments.get(1);
        boolean pdf = PDF_DIRECTORY.equals(directoryName) && fileName.toLowerCase().endsWith(".pdf");
        boolean markdown = MARKDOWN_DIRECTORY.equals(directoryName) && fileName.toLowerCase().endsWith(".md");
        if ((!pdf && !markdown) || !fileName.equals(new File(fileName).getName())) throw new FileNotFoundException("Invalid shared file");
        try {
            File directory = new File(context.getCacheDir(), directoryName).getCanonicalFile();
            File file = new File(directory, fileName).getCanonicalFile();
            if (!directory.equals(file.getParentFile())) throw new FileNotFoundException("Invalid shared file path");
            return file;
        } catch (IOException error) {
            throw new FileNotFoundException(error.getMessage());
        }
    }

    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { throw new UnsupportedOperationException(); }
}
